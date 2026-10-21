import { describe, expect, it, vi } from "vitest";
import { canManageCoordinators, isProjectCoordinator, listCoordinators } from "./coordinators";

/** #1049: the project's owners, and the members they delegate to, make the final call. */

function db({ role, delegated = false }: { role?: "owner" | "admin" | "member"; delegated?: boolean }) {
  return {
    membership: {
      findUnique: vi.fn(async () => (role ? { role } : null)),
      findMany: vi.fn(async () => [{ userId: "olu", user: { name: "Olu", email: "olu@x" } }]),
    },
    projectCoordinator: {
      findUnique: vi.fn(async () => (delegated ? { id: "pc1" } : null)),
      findMany: vi.fn(async () => [
        { userId: "olu", grantedAt: new Date("2026-10-01"), user: { name: "Olu", email: "olu@x" } },
        { userId: "ada", grantedAt: new Date("2026-10-02"), user: { name: "Ada", email: "ada@x" } },
      ]),
    },
  } as never;
}

const where = { tenantId: "t", projectId: "p", userId: "u" };

describe("isProjectCoordinator", () => {
  it("counts the tenant's owners on every project, without a row", async () => {
    expect(await isProjectCoordinator(db({ role: "owner" }), where)).toBe(true);
  });

  it("counts a member the owner delegated to, on that project only", async () => {
    expect(await isProjectCoordinator(db({ role: "member", delegated: true }), where)).toBe(true);
    expect(await isProjectCoordinator(db({ role: "member" }), where)).toBe(false);
  });

  it("is not the same as admin", async () => {
    expect(await isProjectCoordinator(db({ role: "admin" }), where)).toBe(false);
  });

  it("drops someone who left the tenant, whatever rows remain", async () => {
    expect(await isProjectCoordinator(db({ delegated: true }), where)).toBe(false);
  });
});

describe("canManageCoordinators", () => {
  it("is the tenant's owners (and the site's super admin), not its admins", async () => {
    expect(await canManageCoordinators(db({ role: "owner" }), { id: "u" }, "t")).toBe(true);
    expect(await canManageCoordinators(db({ role: "admin" }), { id: "u" }, "t")).toBe(false);
    expect(await canManageCoordinators(db({}), { id: "u", role: "super_admin" }, "t")).toBe(true);
  });
});

describe("listCoordinators", () => {
  it("lists owners first, then the delegated, each once", async () => {
    const rows = await listCoordinators(db({}), { tenantId: "t", projectId: "p" });
    expect(rows.map((row) => [row.userId, row.owner])).toEqual([["olu", true], ["ada", false]]);
  });
});
