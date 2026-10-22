"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-helpers";
import { isTenantAdmin } from "@/lib/agents/membership";
import { currentTenantIdFor, NO_TENANT_MESSAGE } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import {
  acceptAndFoldGuidanceNote,
  createProjectGuidanceNote,
  updateMasterGuidance,
  upvoteProjectGuidanceNote,
} from "@/lib/agent-api/guidance";
import {
  createGuidanceNoteSchema,
  updateGuidanceBodySchema,
} from "@/lib/validations/guidance";

export type GuidanceActionResult = { ok: true } | { ok: false; error: string };

async function verifyProjectAccess(slug: string) {
  const user = await requireUser();
  const tenantId = await currentTenantIdFor(user.id);
  if (!tenantId) return { ok: false as const, error: NO_TENANT_MESSAGE };
  const project = await prisma.project.findFirst({
    where: { tenantId, slug },
    select: { id: true, slug: true },
  });
  if (!project) return { ok: false as const, error: "Project not found." };
  return { ok: true as const, user, tenantId, project };
}

function revalidateGuidance(slug: string) {
  revalidatePath(`/projects/${encodeURIComponent(slug)}/guidance`);
  revalidatePath(`/projects/${encodeURIComponent(slug)}/settings`);
}

export async function updateMasterGuidanceAction(
  slug: string,
  body: string,
): Promise<GuidanceActionResult> {
  const access = await verifyProjectAccess(slug);
  if (!access.ok) return access;

  if (!(await isTenantAdmin(access.user, access.tenantId))) {
    return { ok: false, error: "Only project admins can update the master guidance document." };
  }

  const parsed = updateGuidanceBodySchema.safeParse({ body });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid guidance content." };
  }

  try {
    await updateMasterGuidance({
      tenantId: access.tenantId,
      projectIdOrSlug: slug,
      body: parsed.data.body,
      userId: access.user.id,
    });
    revalidateGuidance(slug);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update guidance." };
  }
}

export async function createGuidanceNoteAction(
  _previous: GuidanceActionResult | undefined,
  formData: FormData,
): Promise<GuidanceActionResult> {
  const slug = String(formData.get("slug") ?? "").trim();
  const access = await verifyProjectAccess(slug);
  if (!access.ok) return access;

  const parsed = createGuidanceNoteSchema.safeParse({
    category: formData.get("category"),
    title: formData.get("title") ?? "",
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note fields." };
  }

  try {
    await createProjectGuidanceNote({
      tenantId: access.tenantId,
      projectIdOrSlug: slug,
      authorUserId: access.user.id,
      category: parsed.data.category,
      title: parsed.data.title,
      body: parsed.data.body,
    });
    revalidateGuidance(slug);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create note." };
  }
}

export async function upvoteGuidanceNoteAction(
  slug: string,
  noteId: string,
): Promise<GuidanceActionResult> {
  const access = await verifyProjectAccess(slug);
  if (!access.ok) return access;

  try {
    await upvoteProjectGuidanceNote({
      tenantId: access.tenantId,
      projectIdOrSlug: slug,
      noteId,
      userId: access.user.id,
    });
    revalidateGuidance(slug);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to upvote note." };
  }
}

export async function acceptGuidanceNoteAction(
  slug: string,
  noteId: string,
): Promise<GuidanceActionResult> {
  const access = await verifyProjectAccess(slug);
  if (!access.ok) return access;

  if (!(await isTenantAdmin(access.user, access.tenantId))) {
    return { ok: false, error: "Only project admins can fold notes into master guidance." };
  }

  try {
    await acceptAndFoldGuidanceNote({
      tenantId: access.tenantId,
      projectIdOrSlug: slug,
      noteId,
      userId: access.user.id,
    });
    revalidateGuidance(slug);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to accept note." };
  }
}
