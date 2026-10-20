import { describe, expect, it } from "vitest";
import { compare, hash } from "bcryptjs";
import { loginSchema } from "./validations/issue";
import { BCRYPT_MAX_PASSWORD_BYTES, truncatePasswordToBcryptLimit } from "./password";

/** bcrypt silently uses only the first 72 bytes of a password (#735). */
describe("truncatePasswordToBcryptLimit (#735)", () => {
  it("keeps short passwords as-is", () => {
    expect(truncatePasswordToBcryptLimit("correct horse battery staple")).toBe(
      "correct horse battery staple",
    );
    expect(truncatePasswordToBcryptLimit("x".repeat(72))).toHaveLength(72);
  });

  it("cuts ASCII passwords at 72 bytes", () => {
    expect(truncatePasswordToBcryptLimit("x".repeat(80))).toBe("x".repeat(72));
  });

  it("cuts UTF-8 on character boundaries, not mid-code-point", () => {
    // 30 cups of tea = 90 bytes; 24 cups = 72 bytes exactly.
    expect(truncatePasswordToBcryptLimit("☕".repeat(30))).toBe("☕".repeat(24));
    // 19 emoji = 76 bytes; 18 emoji = 72 bytes exactly (no broken surrogate).
    expect(truncatePasswordToBcryptLimit("😀".repeat(19))).toBe("😀".repeat(18));
  });

  it("always returns the same bytes for equal byte input", () => {
    const password = "y".repeat(100);
    expect(new TextEncoder().encode(truncatePasswordToBcryptLimit(password)).length).toBe(
      BCRYPT_MAX_PASSWORD_BYTES,
    );
  });
});

/**
 * Why every password schema caps input at 72 bytes (#735): bcryptjs itself
 * truncates silently, so the only defence is rejecting over-long input
 * before it reaches hash()/compare().
 */
describe("bcryptjs truncation vs. validation (#735)", () => {
  const email = "alice@zendor.dev";

  it("would otherwise authenticate a password differing only past 72 bytes", async () => {
    const base = "x".repeat(72);
    const collision = base + "-different-suffix";
    const passwordHash = await hash(base, 4);

    // Native bcryptjs behaviour: the suffix is silently dropped…
    expect(await compare(collision, passwordHash)).toBe(true);
    // …so validation is what keeps the collision from ever reaching compare().
    expect(loginSchema.safeParse({ email, password: collision }).success).toBe(false);
    expect(loginSchema.safeParse({ email, password: base }).success).toBe(true);
    expect(await compare(base, passwordHash)).toBe(true);
  });

  it("hits the byte limit sooner than the character count for multibyte input", async () => {
    const base = "☕".repeat(24); // 24 characters, exactly 72 bytes
    const collision = base + "☕"; // 25 characters, 75 bytes
    const passwordHash = await hash(base, 4);

    expect(await compare(collision, passwordHash)).toBe(true);
    expect(loginSchema.safeParse({ email, password: base }).success).toBe(true);
    expect(loginSchema.safeParse({ email, password: collision }).success).toBe(false);
  });

  it("keeps a normal valid password working end to end", async () => {
    const password = "correct horse battery staple";
    const passwordHash = await hash(password, 4);

    expect(loginSchema.safeParse({ email, password }).success).toBe(true);
    expect(await compare(password, passwordHash)).toBe(true);
    // A different password under the limit stays different — no truncation.
    expect(await compare(`${password}!`, passwordHash)).toBe(false);
  });
});
