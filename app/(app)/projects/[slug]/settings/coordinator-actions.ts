"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-helpers";
import { currentTenantIdFor, NO_TENANT_MESSAGE } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { canManageCoordinators } from "@/lib/coordinators";

export type CoordinatorActionResult = { ok: true } | { ok: false; error: string };

async function access(slug: string) {
  const user = await requireUser();
  const tenantId = await currentTenantIdFor(user.id);
  if (!tenantId) return { ok: false as const, error: NO_TENANT_MESSAGE };
  if (!(await canManageCoordinators(prisma, user, tenantId))) {
    return { ok: false as const, error: "Only the organization's owners can choose a project's coordinators." };
  }
  const project = await prisma.project.findFirst({ where: { tenantId, slug }, select: { id: true, slug: true } });
  if (!project) return { ok: false as const, error: "Project not found." };
  return { ok: true as const, user, tenantId, project };
}

/** #1049: an owner makes a member a coordinator of one project. Audited. */
export async function addCoordinatorAction(
  _previous: CoordinatorActionResult | undefined,
  formData: FormData,
): Promise<CoordinatorActionResult> {
  const checked = await access(String(formData.get("slug") ?? "").trim());
  if (!checked.ok) return checked;
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { ok: false, error: "Choose a member." };
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: checked.tenantId, userId } },
    select: { role: true },
  });
  if (!membership) return { ok: false, error: "That person isn't a member of this organization." };
  if (membership.role === "owner") return { ok: false, error: "Owners are already coordinators of every project." };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.projectCoordinator.findUnique({
      where: { projectId_userId: { projectId: checked.project.id, userId } },
      select: { id: true },
    });
    if (existing) return;
    await tx.projectCoordinator.create({ data: { projectId: checked.project.id, userId, grantedById: checked.user.id } });
    await tx.projectAuditEvent.create({
      data: {
        tenantId: checked.tenantId,
        projectId: checked.project.id,
        actorUserId: checked.user.id,
        action: "coordinator.added",
        changes: { userId },
      },
    });
  });
  revalidatePath(`/projects/${encodeURIComponent(checked.project.slug)}/settings`);
  return { ok: true };
}

/** #1049: an owner takes a member's coordinator role on one project away. Audited. */
export async function removeCoordinatorAction(
  _previous: CoordinatorActionResult | undefined,
  formData: FormData,
): Promise<CoordinatorActionResult> {
  const checked = await access(String(formData.get("slug") ?? "").trim());
  if (!checked.ok) return checked;
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { ok: false, error: "Choose a coordinator." };

  await prisma.$transaction(async (tx) => {
    const removed = await tx.projectCoordinator.deleteMany({ where: { projectId: checked.project.id, userId } });
    if (removed.count === 0) return;
    await tx.projectAuditEvent.create({
      data: {
        tenantId: checked.tenantId,
        projectId: checked.project.id,
        actorUserId: checked.user.id,
        action: "coordinator.removed",
        changes: { userId },
      },
    });
  });
  revalidatePath(`/projects/${encodeURIComponent(checked.project.slug)}/settings`);
  return { ok: true };
}
