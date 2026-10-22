import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.hoisted(() => vi.fn());
const confirmIdentity = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { update: vi.fn(), findUnique: vi.fn() },
    agentApiKey: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/two-factor", () => ({ confirmIdentity }));
vi.mock("bcryptjs", () => ({ hash: vi.fn() }));
vi.mock("@/lib/mail", () => ({ smtpConfigured: vi.fn(), sendMail: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMIT_MESSAGE: "You're doing that too fast. Please wait a moment.",
  consumeAuthRateLimit: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { smtpConfigured, sendMail } from "@/lib/mail";
import { consumeAuthRateLimit } from "@/lib/rate-limit";
import { confirmIdentity as confirmIdentityImport } from "@/lib/two-factor";
import { changePasswordAction, setKeyboardShortcutsAction, setWalletAddressAction, updateDisplayNameAction } from "./settings";

const update = prisma.user.update as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const updateMany = prisma.agentApiKey.updateMany as unknown as ReturnType<typeof vi.fn>;
const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
// bcryptjs's callback overloads make vi.mocked() expect a void return.
const hashMock = hash as unknown as ReturnType<typeof vi.fn>;
const confirmIdentityMock = confirmIdentityImport as unknown as ReturnType<typeof vi.fn>;
const form = (name: string) => {
  const f = new FormData();
  f.set("name", name);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1", role: "user" });
  vi.mocked(consumeAuthRateLimit).mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  vi.mocked(smtpConfigured).mockReturnValue(false);
  confirmIdentityMock.mockResolvedValue({ ok: true });
  update.mockResolvedValue({});
  updateMany.mockResolvedValue({ count: 1 });
  transaction.mockImplementation((operations: unknown[]) => Promise.all(operations));
});

describe("updateDisplayNameAction (#293)", () => {
  it("saves the trimmed name for the signed-in user only, and nothing else", async () => {
    const result = await updateDisplayNameAction(undefined, form("  Ada   Lovelace "));
    expect(result).toEqual({ ok: true, name: "Ada Lovelace" });
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { name: "Ada Lovelace" } });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("ignores any id, email or role smuggled into the form", async () => {
    const f = form("Ada Lovelace");
    f.set("id", "someone-else");
    f.set("email", "x@y.z");
    f.set("role", "super_admin");
    await updateDisplayNameAction(undefined, f);
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { name: "Ada Lovelace" } });
  });

  it.each(["", "   ", "A", "​​", "Sam (Admin)"])(
    "rejects %j and names the field",
    async (name) => {
      const result = await updateDisplayNameAction(undefined, form(name));
      expect(result.ok).toBeUndefined();
      expect(result.field).toBe("name");
      expect(result.fieldErrors?.name).toBeTruthy();
      expect(update).not.toHaveBeenCalled();
    },
  );

  it("lets an admin use the word", async () => {
    requireUser.mockResolvedValue({ id: "a1", role: "admin" });
    const result = await updateDisplayNameAction(undefined, form("Sam (Admin)"));
    expect(result.ok).toBe(true);
  });

  it("treats a missing field as blank", async () => {
    const result = await updateDisplayNameAction(undefined, new FormData());
    expect(result.field).toBe("name");
  });
});

describe("setKeyboardShortcutsAction (#287)", () => {
  it("saves the switch for the signed-in user and refreshes every page", async () => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "u1", role: "user" });
    expect(await setKeyboardShortcutsAction(false)).toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { keyboardShortcuts: false } });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("rejects anything but a boolean", async () => {
    vi.clearAllMocks();
    expect(await setKeyboardShortcutsAction("off")).toEqual({ error: "Invalid setting" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("setWalletAddressAction (#618)", () => {
  const walletForm = (value: string | null) => {
    const f = new FormData();
    if (value !== null) f.set("walletAddress", value);
    return f;
  };
  const address = `0x${"a".repeat(40)}`;

  it("saves the trimmed address on the signed-in person's own row", async () => {
    const result = await setWalletAddressAction(undefined, walletForm(`  ${address}  `));
    expect(result).toEqual({ ok: true, walletAddress: address });
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { walletAddress: address } });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("ignores any id smuggled into the form, so nobody can set a wallet for someone else", async () => {
    const f = walletForm(address);
    f.set("id", "someone-else");
    await setWalletAddressAction(undefined, f);
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { walletAddress: address } });
  });

  it("clears the address when the field is left empty", async () => {
    expect(await setWalletAddressAction(undefined, walletForm(""))).toEqual({
      ok: true,
      walletAddress: null,
    });
    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { walletAddress: null } });
  });

  it.each([
    ["a truncated address", "0xdeadbeef"],
    ["a missing 0x prefix", `0${"a".repeat(40)}`],
    ["non-hex characters", `0x${"g".repeat(40)}`],
    ["a domain instead of an address", "vitalik.eth"],
  ])("rejects %s and writes nothing", async (_label, value) => {
    const result = await setWalletAddressAction(undefined, walletForm(value));
    expect(result.ok).toBeUndefined();
    expect(result.field).toBe("walletAddress");
    expect(result.error).toContain("EVM address");
    expect(update).not.toHaveBeenCalled();
  });
});

describe("changePasswordAction (#570, #568)", () => {
  const passwordForm = (currentPassword = "OldPassw0rd!", password = "NewPassw0rd!", code?: string) => {
    const f = new FormData();
    f.set("currentPassword", currentPassword);
    f.set("password", password);
    f.set("confirmPassword", password);
    if (code !== undefined) f.set("code", code);
    return f;
  };

  it("updates only the signed-in user's password, invalidates sessions, and revokes agent keys", async () => {
    findUnique.mockResolvedValue({ email: "ada@example.com", passwordHash: "old-hash" });
    hashMock.mockResolvedValue("new-hash");

    await expect(changePasswordAction(undefined, passwordForm())).resolves.toEqual({ ok: true });

    expect(consumeAuthRateLimit).toHaveBeenCalledWith("changePassword", { email: "user:u1", ip: null });
    expect(confirmIdentityMock).toHaveBeenCalledWith("u1", { password: "OldPassw0rd!", code: undefined });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "new-hash", sessionVersion: { increment: 1 } },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { revokedAt: null, agent: { ownerUserId: "u1" } },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("asks for and forwards a two-factor code when the account has one", async () => {
    findUnique.mockResolvedValue({ email: "ada@example.com", passwordHash: "old-hash" });
    hashMock.mockResolvedValue("new-hash");

    await expect(changePasswordAction(undefined, passwordForm("OldPassw0rd!", "NewPassw0rd!", "123456"))).resolves.toEqual({ ok: true });

    expect(confirmIdentityMock).toHaveBeenCalledWith("u1", { password: "OldPassw0rd!", code: "123456" });
  });

  it("does not change the password when the two-factor code is missing or wrong", async () => {
    findUnique.mockResolvedValue({ email: "ada@example.com", passwordHash: "old-hash" });
    confirmIdentityMock.mockResolvedValue({ ok: false, error: "Enter a code from your authenticator app or a backup code." });

    await expect(changePasswordAction(undefined, passwordForm())).resolves.toMatchObject({
      field: "code",
      error: expect.stringMatching(/code/),
    });
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects an incorrect current password without changing it", async () => {
    findUnique.mockResolvedValue({ email: "ada@example.com", passwordHash: "old-hash" });
    confirmIdentityMock.mockResolvedValue({ ok: false, error: "That password isn't right." });

    await expect(changePasswordAction(undefined, passwordForm("wrong password"))).resolves.toMatchObject({
      field: "currentPassword",
      error: "That password isn't right.",
    });
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("does not check credentials or update when password-change attempts are rate limited", async () => {
    vi.mocked(consumeAuthRateLimit).mockResolvedValue({ allowed: false, retryAfterMs: 1000 });

    await expect(changePasswordAction(undefined, passwordForm())).resolves.toEqual({
      error: "You're doing that too fast. Please wait a moment.",
    });
    expect(findUnique).not.toHaveBeenCalled();
    expect(confirmIdentityMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("sends a security notice when mail is available, without delaying the password change", async () => {
    findUnique.mockResolvedValue({ email: "ada@example.com", passwordHash: "old-hash" });
    hashMock.mockResolvedValue("new-hash");
    vi.mocked(smtpConfigured).mockReturnValue(true);
    vi.mocked(sendMail).mockResolvedValue(undefined);

    await changePasswordAction(undefined, passwordForm());
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "ada@example.com",
      subject: "Your Ziki Issues password was changed",
    }));
  });
});
