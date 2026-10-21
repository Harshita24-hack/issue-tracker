import type { Prisma, PrismaClient } from "@prisma/client";
import { isSuperAdmin, type AppRole } from "@/lib/roles";

/**
 * Project coordinators (#1049): the people a project trusts with the final
 * call — merging an accepted fix, resolving or closing an issue, and so the
 * points that step pays. Without it, agents could close each other's work to
 * collect points.
 *
 * - The tenant's owners own its projects, so they are always coordinators.
 * - They delegate it to other members, per project (`ProjectCoordinator`).
 * - It is not tenant admin: an admin who isn't a coordinator can't make the
 *   final call, and a coordinator needn't be an admin.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export const COORDINATOR_LABEL = "Coordinator";

export const NOT_COORDINATOR_MESSAGE =
  "Only a project coordinator can resolve or close an issue, or merge its fix. The project's owners are coordinators, and can make others coordinators in the project's settings.";

/** True when `userId` makes the final call on `projectId`'s issues. */
export async function isProjectCoordinator(
  db: Db,
  input: { tenantId: string; projectId: string | null | undefined; userId: string },
): Promise<boolean> {
  const membership = await db.membership.findUnique({
    where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
    select: { role: true },
  });
  // Someone who has left the tenant is no coordinator, whatever rows remain.
  if (!membership) return false;
  if (membership.role === "owner") return true;
  if (!input.projectId) return false;
  const row = await db.projectCoordinator.findUnique({
    where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
    select: { id: true },
  });
  return Boolean(row);
}

/** Who may add or remove a project's coordinators: the tenant's owners. */
export async function canManageCoordinators(
  db: Db,
  user: { id: string; role?: AppRole | null },
  tenantId: string,
): Promise<boolean> {
  if (isSuperAdmin(user.role)) return true;
  const membership = await db.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    select: { role: true },
  });
  return membership?.role === "owner";
}

export type CoordinatorEntry = {
  userId: string;
  name: string | null;
  email: string | null;
  /** Owners are coordinators by owning the tenant, and can't be removed here. */
  owner: boolean;
  grantedAt: Date | null;
};

/** A project's coordinators: the tenant's owners first, then the delegated. */
export async function listCoordinators(
  db: Db,
  input: { tenantId: string; projectId: string },
): Promise<CoordinatorEntry[]> {
  const [owners, delegated] = await Promise.all([
    db.membership.findMany({
      where: { tenantId: input.tenantId, role: "owner" },
      orderBy: { createdAt: "asc" },
      select: { userId: true, user: { select: { name: true, email: true } } },
    }),
    db.projectCoordinator.findMany({
      where: { projectId: input.projectId, user: { memberships: { some: { tenantId: input.tenantId } } } },
      orderBy: { grantedAt: "asc" },
      select: { userId: true, grantedAt: true, user: { select: { name: true, email: true } } },
    }),
  ]);
  const ownerIds = new Set(owners.map((owner) => owner.userId));
  return [
    ...owners.map((owner) => ({ userId: owner.userId, name: owner.user.name, email: owner.user.email, owner: true, grantedAt: null })),
    ...delegated
      .filter((row) => !ownerIds.has(row.userId))
      .map((row) => ({ userId: row.userId, name: row.user.name, email: row.user.email, owner: false, grantedAt: row.grantedAt })),
  ];
}
