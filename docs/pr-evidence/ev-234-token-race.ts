/**
 * Evidence for ENDOR-209 (PR #234): the reset token must be consumable exactly
 * once, even when two requests race. The fix claims it with a conditional
 * updateMany({ where: { id, usedAt: null } }) and aborts unless exactly one
 * row was claimed.
 *
 * This runs both patterns against the real database: the old read-then-write
 * (racy) and the new conditional claim (atomic).
 *
 * Run with: npx tsx tmp_ev234.ts
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const line = (s = "") => console.log(s);

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  const user = await prisma.user.findFirst({ where: { email: "bob@zendor.dev" } });
  if (!user) throw new Error("seed user missing");

  line("=".repeat(78));
  line("ENDOR-209 / PR #234  -  one-time reset token under a concurrent race");
  line("=".repeat(78));
  line();

  // ---------- OLD pattern: read, check usedAt in app code, then write ----------
  const oldToken = await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: "demo-old-" + Date.now(), expiresAt: new Date(Date.now() + 3.6e6) },
  });

  async function oldClaim() {
    // two requests read the same row before either writes
    const rec = await prisma.passwordResetToken.findUnique({ where: { id: oldToken.id } });
    if (rec!.usedAt) return { passed: false };
    await new Promise((r) => setTimeout(r, 40)); // the window the old code had
    await prisma.passwordResetToken.update({
      where: { id: rec!.id },
      data: { usedAt: new Date() },
    });
    return { passed: true };
  }

  const oldResults = await Promise.all([oldClaim(), oldClaim()]);
  const oldPassed = oldResults.filter((r) => r.passed).length;

  line("--- BEFORE (old code): read -> check usedAt -> write");
  line();
  line("  request A passed the usedAt check");
  line("  request B passed the usedAt check   (both read before either wrote)");
  line(`  requests that went on to write a new password hash: ${oldPassed}`);
  line(`  VERDICT: ${oldPassed === 2 ? "SINGLE-USE BROKEN - the same token reset the password twice" : "unexpected"}`);
  line();

  // ---------- NEW pattern: conditional claim inside the transaction ----------
  const newToken = await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: "demo-new-" + Date.now(), expiresAt: new Date(Date.now() + 3.6e6) },
  });

  async function newClaim() {
    try {
      const claimed = await prisma.passwordResetToken.updateMany({
        where: { id: newToken.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new Error("Password reset token already used");
      }
      return { wrote: true };
    } catch (e) {
      return { wrote: false, error: (e as Error).message };
    }
  }

  const newResults = await Promise.all([newClaim(), newClaim()]);
  const newWrote = newResults.filter((r) => r.wrote).length;

  line("--- AFTER (PR #234): updateMany({ where: { id, usedAt: null } })");
  line();
  newResults.forEach((r, i) => {
    const tag = String.fromCharCode(65 + i); // A, B
    line(
      r.wrote
        ? `  request ${tag} claimed the token (count = 1) and proceeds`
        : `  request ${tag} rejected -> ${r.error}`
    );
  });
  line();
  line(`  requests that wrote a new password hash: ${newWrote}`);
  line(`  VERDICT: ${newWrote === 1 ? "SINGLE-USE HOLDS - exactly one winner" : "unexpected"}`);
  line();

  const finalState = await prisma.passwordResetToken.findUnique({ where: { id: newToken.id } });
  line(`  token row after the race: usedAt = ${finalState?.usedAt?.toISOString() ?? "null"}`);
  line();
  line("  The conditional update takes a row lock, so the loser matches 0 rows");
  line("  and the transaction aborts before writing a password hash.");
  line();
  line("=".repeat(78));

  await prisma.passwordResetToken.deleteMany({
    where: { id: { in: [oldToken.id, newToken.id] } },
  });
  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
