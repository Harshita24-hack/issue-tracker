import { prisma } from "@/lib/prisma";
import { IssueApiError } from "@/lib/agent-api/issues";
import type { GuidanceCategory, ListGuidanceNotesQuery } from "@/lib/validations/guidance";

export const DEFAULT_GUIDANCE_BODY = `# Project Guidance & Shared Rules

Welcome to the shared guidance repository for this project.
Agents should inspect these instructions to understand project architecture, environment setup, and execution constraints.
`;

export async function resolveProject(tenantId: string, projectIdOrSlug: string) {
  const project = await prisma.project.findFirst({
    where: {
      tenantId,
      OR: [{ id: projectIdOrSlug }, { slug: projectIdOrSlug }],
    },
    select: { id: true, slug: true, name: true, tenantId: true },
  });
  if (!project) throw new IssueApiError(404, "Project not found.");
  return project;
}

export async function ensureProjectGuidance(projectId: string) {
  const existing = await prisma.projectGuidance.findUnique({
    where: { projectId },
  });
  if (existing) return existing;

  return prisma.projectGuidance.create({
    data: {
      projectId,
      body: DEFAULT_GUIDANCE_BODY,
    },
  });
}

export async function getProjectGuidance(tenantId: string, projectIdOrSlug: string) {
  const project = await resolveProject(tenantId, projectIdOrSlug);
  const guidance = await ensureProjectGuidance(project.id);

  const [notesCount, pendingNotesCount, acceptedNotesCount] = await Promise.all([
    prisma.projectGuidanceNote.count({ where: { projectId: project.id } }),
    prisma.projectGuidanceNote.count({ where: { projectId: project.id, status: "pending" } }),
    prisma.projectGuidanceNote.count({ where: { projectId: project.id, status: "accepted" } }),
  ]);

  return {
    id: guidance.id,
    projectId: project.id,
    projectSlug: project.slug,
    projectName: project.name,
    body: guidance.body,
    updatedAt: guidance.updatedAt,
    notesCount,
    pendingNotesCount,
    acceptedNotesCount,
  };
}

export async function listProjectGuidanceNotes(
  tenantId: string,
  projectIdOrSlug: string,
  query: ListGuidanceNotesQuery = { status: "all", sort: "top" },
) {
  const project = await resolveProject(tenantId, projectIdOrSlug);

  const where = {
    projectId: project.id,
    ...(query.category ? { category: query.category } : {}),
    ...(query.status && query.status !== "all" ? { status: query.status } : {}),
  };

  const orderBy =
    query.sort === "newest"
      ? [{ createdAt: "desc" as const }]
      : [{ upvotes: "desc" as const }, { createdAt: "desc" as const }];

  const items = await prisma.projectGuidanceNote.findMany({
    where,
    orderBy,
    include: {
      authorAgent: { select: { id: true, name: true } },
      authorUser: { select: { id: true, name: true } },
      acceptedBy: { select: { id: true, name: true } },
    },
  });

  return {
    projectId: project.id,
    projectSlug: project.slug,
    total: items.length,
    items,
  };
}

export async function createProjectGuidanceNote(params: {
  tenantId: string;
  projectIdOrSlug: string;
  authorAgentId?: string;
  authorUserId?: string;
  category: GuidanceCategory;
  title?: string;
  body: string;
}) {
  const project = await resolveProject(params.tenantId, params.projectIdOrSlug);
  const guidance = await ensureProjectGuidance(project.id);

  const note = await prisma.projectGuidanceNote.create({
    data: {
      guidanceId: guidance.id,
      projectId: project.id,
      authorAgentId: params.authorAgentId ?? null,
      authorUserId: params.authorUserId ?? null,
      category: params.category,
      title: params.title?.trim() || null,
      body: params.body.trim(),
      status: "pending",
      upvotes: 0,
    },
    include: {
      authorAgent: { select: { id: true, name: true } },
      authorUser: { select: { id: true, name: true } },
    },
  });

  return note;
}

export async function upvoteProjectGuidanceNote(params: {
  tenantId: string;
  projectIdOrSlug: string;
  noteId: string;
  agentId?: string;
  userId?: string;
}) {
  const project = await resolveProject(params.tenantId, params.projectIdOrSlug);

  const note = await prisma.projectGuidanceNote.findFirst({
    where: { id: params.noteId, projectId: project.id },
  });
  if (!note) throw new IssueApiError(404, "Guidance note not found.");

  // Check if agent or user has already voted
  const voteFilter = params.agentId
    ? { noteId_agentId: { noteId: note.id, agentId: params.agentId } }
    : params.userId
      ? { noteId_userId: { noteId: note.id, userId: params.userId } }
      : null;

  if (!voteFilter) throw new IssueApiError(400, "Voter identity required.");

  let alreadyVoted = false;
  if (params.agentId) {
    const existing = await prisma.projectGuidanceVote.findUnique({
      where: { noteId_agentId: { noteId: note.id, agentId: params.agentId } },
    });
    if (existing) alreadyVoted = true;
  } else if (params.userId) {
    const existing = await prisma.projectGuidanceVote.findUnique({
      where: { noteId_userId: { noteId: note.id, userId: params.userId } },
    });
    if (existing) alreadyVoted = true;
  }

  if (alreadyVoted) {
    return { noteId: note.id, upvotes: note.upvotes, alreadyVoted: true };
  }

  // Create vote and increment note upvotes atomically
  const updated = await prisma.$transaction(async (tx) => {
    await tx.projectGuidanceVote.create({
      data: {
        noteId: note.id,
        agentId: params.agentId ?? null,
        userId: params.userId ?? null,
      },
    });
    return tx.projectGuidanceNote.update({
      where: { id: note.id },
      data: { upvotes: { increment: 1 } },
      select: { id: true, upvotes: true },
    });
  });

  return { noteId: updated.id, upvotes: updated.upvotes, alreadyVoted: false };
}

export function formatFoldedNoteSection(params: {
  category: string;
  title?: string | null;
  body: string;
  authorName: string;
  authorType: "agent" | "human";
  date: Date;
}): string {
  const titlePart = params.title?.trim() ? `: ${params.title.trim()}` : "";
  const header = `### [${params.category.toUpperCase()}]${titlePart}`;
  const metadata = `> Folded from ${params.authorType === "agent" ? "Agent" : "User"} ${params.authorName} on ${params.date.toISOString().slice(0, 10)}`;
  return `\n\n${header}\n${metadata}\n\n${params.body.trim()}\n`;
}

export async function acceptAndFoldGuidanceNote(params: {
  tenantId: string;
  projectIdOrSlug: string;
  noteId: string;
  userId: string;
}) {
  const project = await resolveProject(params.tenantId, params.projectIdOrSlug);
  const note = await prisma.projectGuidanceNote.findFirst({
    where: { id: params.noteId, projectId: project.id },
    include: {
      authorAgent: { select: { id: true, name: true } },
      authorUser: { select: { id: true, name: true } },
      guidance: true,
    },
  });
  if (!note) throw new IssueApiError(404, "Guidance note not found.");

  if (note.status === "accepted") {
    return { ok: true, alreadyAccepted: true, note };
  }

  const now = new Date();
  const authorName = note.authorAgent?.name ?? note.authorUser?.name ?? "Contributor";
  const authorType = note.authorAgent ? ("agent" as const) : ("human" as const);
  const foldedText = formatFoldedNoteSection({
    category: note.category,
    title: note.title,
    body: note.body,
    authorName,
    authorType,
    date: now,
  });

  const currentBody = note.guidance.body;
  const newBody = `${currentBody.trimEnd()}${foldedText}`;

  const result = await prisma.$transaction(async (tx) => {
    const updatedNote = await tx.projectGuidanceNote.update({
      where: { id: note.id },
      data: {
        status: "accepted",
        acceptedAt: now,
        acceptedByUserId: params.userId,
      },
      include: {
        authorAgent: { select: { id: true, name: true } },
        authorUser: { select: { id: true, name: true } },
        acceptedBy: { select: { id: true, name: true } },
      },
    });

    const updatedGuidance = await tx.projectGuidance.update({
      where: { id: note.guidanceId },
      data: {
        body: newBody,
        updatedByUserId: params.userId,
      },
    });

    return { updatedNote, updatedGuidance };
  });

  return {
    ok: true,
    alreadyAccepted: false,
    note: result.updatedNote,
    guidance: result.updatedGuidance,
  };
}

export async function updateMasterGuidance(params: {
  tenantId: string;
  projectIdOrSlug: string;
  body: string;
  userId?: string;
}) {
  const project = await resolveProject(params.tenantId, params.projectIdOrSlug);
  const guidance = await ensureProjectGuidance(project.id);

  const updated = await prisma.projectGuidance.update({
    where: { id: guidance.id },
    data: {
      body: params.body,
      updatedByUserId: params.userId ?? null,
    },
  });

  return {
    id: updated.id,
    projectId: project.id,
    projectSlug: project.slug,
    body: updated.body,
    updatedAt: updated.updatedAt,
  };
}
