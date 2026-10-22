import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "admin-1", name: "Ada", role: "user" }),
}));

vi.mock("@/lib/session-user", () => ({
  resolveSessionUserId: vi.fn(async () => null),
  SESSION_EXPIRED_MESSAGE: "Session expired",
}));

vi.mock("@/lib/notify", () => ({ notifyLater: vi.fn() }));

vi.mock("@/lib/tenant-access", () => ({
  currentTenantAccess: vi.fn(async () => ({
    tenantId: "tenant-zedu",
    tenantName: "Zedu",
    tenantSlug: "zedu",
    membershipRole: "admin",
    admin: true,
  })),
}));

vi.mock("@/lib/tenant-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenant-context")>()),
  currentTenantIdFor: vi.fn(async () => "tenant-zedu"),
}));

vi.mock("@/lib/agent-api/web-events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent-api/web-events")>()),
  publishWebEvent: vi.fn(async () => undefined),
}));

const db = vi.hoisted(() => {
  const tx = {
    attachment: { deleteMany: vi.fn() },
    bug: { update: vi.fn() },
    bugActivity: { create: vi.fn() },
    $queryRaw: vi.fn(async () => []),
  };
  return {
    tx,
    prisma: {
      bug: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: db.prisma }));

import { deleteBugAction } from "./issues";

beforeEach(() => {
  vi.clearAllMocks();
  db.prisma.bug.findUnique.mockResolvedValue({ id: "bug-1", isDeleted: false });
});

describe("deleteBugAction attachments (#411)", () => {
  it("soft deletes the issue without deleting its attachments", async () => {
    const result = await deleteBugAction("bug-1");

    expect(result).toBeUndefined();
    expect(db.tx.attachment.deleteMany).not.toHaveBeenCalled();
    expect(db.tx.bug.update).toHaveBeenCalledWith({
      where: { id: "bug-1" },
      data: expect.objectContaining({ isDeleted: true }),
    });
  });

  it("does not delete attachments when the issue is already deleted", async () => {
    db.prisma.bug.findUnique.mockResolvedValue({ id: "bug-1", isDeleted: true });

    const result = await deleteBugAction("bug-1");

    expect(result).toEqual({ error: "Issue is already deleted" });
    expect(db.tx.attachment.deleteMany).not.toHaveBeenCalled();
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });
});
