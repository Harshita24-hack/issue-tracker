/**
 * Evidence for ENDOR-210 (PR #235): with SMTP unconfigured, sendMail used to
 * report success in production while the caller logged the message - including
 * the live reset token - to the console. It now throws in production instead.
 *
 * Run with: npx tsx tmp_ev235.ts
 */
import { sendMail, MailNotConfiguredError } from "./lib/mail";

const RESET_URL =
  "https://issues.zedu.chat/reset-password?token=eyJhbGciOiJIUzI1NiJ9.SECRET_RESET_TOKEN.signature";

for (const k of ["SMTP_HOST", "SMTP_FROM", "SMTP_USER", "SMTP_PASS"]) delete process.env[k];

const line = (s = "") => console.log(s);

async function main() {
  line("=".repeat(74));
  line("ENDOR-210 / PR #235  -  sendMail() with SMTP unconfigured");
  line("=".repeat(74));
  line();

  line("--- BEFORE behaviour: NODE_ENV=development (the old silent-success path)");
  line();
  process.env.NODE_ENV = "development";
  try {
    await sendMail({
      to: "victim@example.com",
      subject: "Reset your Zedu password",
      text: `Use this link: ${RESET_URL}`,
    });
    line("  sendMail() returned normally - caller logged success");
    line("  ^ the live reset token was written to the container log");
  } catch (e) {
    line(`  threw: ${(e as Error).message}`);
  }
  line();

  line("--- AFTER behaviour: NODE_ENV=production");
  line();
  process.env.NODE_ENV = "production";
  try {
    await sendMail({
      to: "victim@example.com",
      subject: "Reset your Zedu password",
      text: `Use this link: ${RESET_URL}`,
    });
    line("  sendMail() returned normally");
    line("  ^ regression: still reporting success with no SMTP transport");
  } catch (e) {
    const known = e instanceof MailNotConfiguredError;
    line(`  threw ${(e as Error).constructor.name}`);
    line(`  message: ${(e as Error).message}`);
    line(`  is MailNotConfiguredError: ${known}`);
    line();
    line("  forgotPasswordAction's existing try/catch now logs an explicit");
    line('  "SMTP is not configured" error instead of a fake success, and the');
    line("  reset URL - token included - never reaches the log.");
  }
  line();
  line("=".repeat(74));
}

main().then(() => process.exit(0));
