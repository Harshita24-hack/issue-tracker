import { beforeEach, describe, expect, it, vi } from "vitest";

/** #1049: an owner adds and removes a project's coordinators; each change is audited. */

const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  currentTenantIdFor: vi.fn(),
  revalidatePath: vi.fn(),
  membershipFindUnique: vi.fn(),
  projectFindFirst: vi.fn(),
  coordinatorFindUnique: vi.fn(),
  coordinatorCreate: vi.fn(),
  coordinatorDeleteMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser: m.requireUser }));
vi.mock("@/lib/tenant-context", () => ({ currentTenantIdFor: m.currentTenantIdFor, NO_TENANT_MESSAGE: "No workspace." }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    projectCoordinator: { findUnique: m.coordinatorFindUnique, create: m.coordinatorCreate, deleteMany: m.coordinatorDeleteMany },
    projectAuditEvent: { create: m.auditCreate },
  };
  return {
    prisma: {
      ...tx,
      membership: { findUnique: m.membershipFindUnique },
      project: { findFirst: m.projectFindFirst },
      $transaction: vi.fn(async (run: (db: typeof tx) => unknown) => run(tx)),
    },
  };
});

import { addCoordinatorAction, removeCoordinatorAction } from "./coordinator-actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  data.set("slug", "web");
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

/** The actor's role, then the target's (when the action looks the target up). */
function roles(actor: string | null, target?: string | null) {
  m.membershipFindUnique.mockImplementation(async ({ where }: { where: { tenantId_userId: { userId: string } } }) => {
    const role = where.tenantId_userId.userId === "owner-1" ? actor : target;
    return role ? { role } : null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireUser.mockResolvedValue({ id: "owner-1" });
  m.currentTenantIdFor.mockResolvedValue("tenant-1");
  m.projectFindFirst.mockResolvedValue({ id: "project-1", slug: "web" });
  m.coordinatorFindUnique.mockResolvedValue(null);
  m.coordinatorDeleteMany.mockResolvedValue({ count: 1 });
});

describe("addCoordinatorAction (#1049)", () => {
  it("lets an owner make a member a coordinator, and audits it", async () => {
    roles("owner", "member");
    await expect(addCoordinatorAction(undefined, form({ userId: "ada" }))).resolves.toEqual({ ok: true });
    expect(m.coordinatorCreate).toHaveBeenCalledWith({ data: { projectId: "project-1", userId: "ada", grantedById: "owner-1" } });
    expect(m.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: "project-1", actorUserId: "owner-1", action: "coordinator.added", changes: { userId: "ada" } }),
    });
    expect(m.revalidatePath).toHaveBeenCalledWith("/projects/web/settings");
  });

  it("refuses an admin who isn't an owner", async () => {
    roles("admin", "member");
    await expect(addCoordinatorAction(undefined, form({ userId: "ada" }))).resolves.toMatchObject({ ok: false, error: expect.stringContaining("owners") });
    expect(m.coordinatorCreate).not.toHaveBeenCalled();
  });

  it("refuses someone outside the organization", async () => {
    roles("owner", null);
    await expect(addCoordinatorAction(undefined, form({ userId: "stranger" }))).resolves.toMatchObject({ ok: false });
    expect(m.coordinatorCreate).not.toHaveBeenCalled();
  });

  it("writes nothing, and audits nothing, for someone already a coordinator", async () => {
    roles("owner", "member");
    m.coordinatorFindUnique.mockResolvedValue({ id: "pc1" });
    await expect(addCoordinatorAction(undefined, form({ userId: "ada" }))).resolves.toEqual({ ok: true });
    expect(m.coordinatorCreate).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });
});

describe("removeCoordinatorAction (#1049)", () => {
  it("lets an owner remove a coordinator, and audits it", async () => {
    roles("owner");
    await expect(removeCoordinatorAction(undefined, form({ userId: "ada" }))).resolves.toEqual({ ok: true });
    expect(m.coordinatorDeleteMany).toHaveBeenCalledWith({ where: { projectId: "project-1", userId: "ada" } });
    expect(m.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "coordinator.removed", changes: { userId: "ada" } }) });
  });

  it("refuses a member", async () => {
    roles("member");
    await expect(removeCoordinatorAction(undefined, form({ userId: "ada" }))).resolves.toMatchObject({ ok: false });
    expect(m.coordinatorDeleteMany).not.toHaveBeenCalled();
  });
});
