import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  projectGuidance: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  projectGuidanceNote: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  projectGuidanceVote: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  acceptAndFoldGuidanceNote,
  createProjectGuidanceNote,
  formatFoldedNoteSection,
  getProjectGuidance,
  listProjectGuidanceNotes,
  upvoteProjectGuidanceNote,
} from "./guidance";

const mockProject = {
  id: "proj-1",
  slug: "web",
  name: "Ziki Web",
  tenantId: "tenant-1",
};

const mockGuidance = {
  id: "guidance-1",
  projectId: "proj-1",
  body: "# Master Guidance\nInitial content.",
  updatedAt: new Date("2026-10-22T10:00:00Z"),
};

beforeEach(() => {
  vi.resetAllMocks();
  db.project.findFirst.mockResolvedValue(mockProject);
  db.projectGuidance.findUnique.mockResolvedValue(mockGuidance);
  db.projectGuidanceNote.count.mockResolvedValue(0);
});

describe("formatFoldedNoteSection", () => {
  it("formats an agent learning into markdown with attribution header", () => {
    const formatted = formatFoldedNoteSection({
      category: "learning",
      title: "Prisma Client Regeneration",
      body: "Always run pnpm prisma generate after schema changes.",
      authorName: "Quantum-Agent",
      authorType: "agent",
      date: new Date("2026-10-22T00:00:00Z"),
    });

    expect(formatted).toContain("### [LEARNING]: Prisma Client Regeneration");
    expect(formatted).toContain("Folded from Agent Quantum-Agent on 2026-10-22");
    expect(formatted).toContain("Always run pnpm prisma generate after schema changes.");
  });
});

describe("getProjectGuidance", () => {
  it("retrieves master guidance and notes counts for a valid project", async () => {
    db.projectGuidanceNote.count
      .mockResolvedValueOnce(5) // total
      .mockResolvedValueOnce(2) // pending
      .mockResolvedValueOnce(3); // accepted

    const result = await getProjectGuidance("tenant-1", "web");

    expect(result).toEqual({
      id: "guidance-1",
      projectId: "proj-1",
      projectSlug: "web",
      projectName: "Ziki Web",
      body: "# Master Guidance\nInitial content.",
      updatedAt: mockGuidance.updatedAt,
      notesCount: 5,
      pendingNotesCount: 2,
      acceptedNotesCount: 3,
    });
  });

  it("throws 404 if project is not found in tenant", async () => {
    db.project.findFirst.mockResolvedValue(null);
    await expect(getProjectGuidance("tenant-1", "unknown")).rejects.toThrow("Project not found.");
  });
});

describe("listProjectGuidanceNotes", () => {
  it("lists notes sorted by upvotes and filtered by category", async () => {
    const notes = [
      { id: "note-1", category: "learning", title: "Note 1", upvotes: 10, status: "pending" },
      { id: "note-2", category: "learning", title: "Note 2", upvotes: 2, status: "pending" },
    ];
    db.projectGuidanceNote.findMany.mockResolvedValue(notes);

    const result = await listProjectGuidanceNotes("tenant-1", "proj-1", {
      category: "learning",
      status: "pending",
      sort: "top",
    });

    expect(result.total).toBe(2);
    expect(result.items).toEqual(notes);
    expect(db.projectGuidanceNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "proj-1", category: "learning", status: "pending" },
        orderBy: [{ upvotes: "desc" }, { createdAt: "desc" }],
      }),
    );
  });
});

describe("createProjectGuidanceNote", () => {
  it("creates a new pending note submitted by an agent", async () => {
    const createdNote = {
      id: "note-new",
      guidanceId: "guidance-1",
      projectId: "proj-1",
      authorAgentId: "agent-1",
      category: "setup",
      title: "Node 22 Requirement",
      body: "Use Node 22 for all test runs.",
      status: "pending",
      upvotes: 0,
    };
    db.projectGuidanceNote.create.mockResolvedValue(createdNote);

    const result = await createProjectGuidanceNote({
      tenantId: "tenant-1",
      projectIdOrSlug: "web",
      authorAgentId: "agent-1",
      category: "setup",
      title: "Node 22 Requirement",
      body: "Use Node 22 for all test runs.",
    });

    expect(result).toEqual(createdNote);
    expect(db.projectGuidanceNote.create).toHaveBeenCalledWith({
      data: {
        guidanceId: "guidance-1",
        projectId: "proj-1",
        authorAgentId: "agent-1",
        authorUserId: null,
        category: "setup",
        title: "Node 22 Requirement",
        body: "Use Node 22 for all test runs.",
        status: "pending",
        upvotes: 0,
      },
      include: {
        authorAgent: { select: { id: true, name: true } },
        authorUser: { select: { id: true, name: true } },
      },
    });
  });
});

describe("upvoteProjectGuidanceNote", () => {
  it("records upvote idempotently", async () => {
    db.projectGuidanceNote.findFirst.mockResolvedValue({ id: "note-1", projectId: "proj-1", upvotes: 3 });
    db.projectGuidanceVote.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => Promise<unknown>) => {
      return callback({
        projectGuidanceVote: { create: vi.fn() },
        projectGuidanceNote: {
          update: vi.fn().mockResolvedValue({ id: "note-1", upvotes: 4 }),
        },
      } as unknown as typeof db);
    });

    const result = await upvoteProjectGuidanceNote({
      tenantId: "tenant-1",
      projectIdOrSlug: "proj-1",
      noteId: "note-1",
      agentId: "agent-1",
    });

    expect(result).toEqual({ noteId: "note-1", upvotes: 4, alreadyVoted: false });
  });

  it("returns alreadyVoted: true without incrementing if voter already voted", async () => {
    db.projectGuidanceNote.findFirst.mockResolvedValue({ id: "note-1", projectId: "proj-1", upvotes: 4 });
    db.projectGuidanceVote.findUnique.mockResolvedValue({ id: "vote-1" });

    const result = await upvoteProjectGuidanceNote({
      tenantId: "tenant-1",
      projectIdOrSlug: "proj-1",
      noteId: "note-1",
      agentId: "agent-1",
    });

    expect(result).toEqual({ noteId: "note-1", upvotes: 4, alreadyVoted: true });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("acceptAndFoldGuidanceNote", () => {
  it("marks note accepted and folds content into master guidance document", async () => {
    const existingNote = {
      id: "note-1",
      guidanceId: "guidance-1",
      projectId: "proj-1",
      category: "rule",
      title: "No Any Types",
      body: "Strict TypeScript mode with 0 any.",
      status: "pending",
      authorAgent: { id: "agent-1", name: "Quantum-Agent" },
      authorUser: null,
      guidance: { id: "guidance-1", body: "# Master Guidance\nInitial content." },
    };

    db.projectGuidanceNote.findFirst.mockResolvedValue(existingNote);
    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => Promise<unknown>) => {
      return callback({
        projectGuidanceNote: {
          update: vi.fn().mockResolvedValue({ ...existingNote, status: "accepted" }),
        },
        projectGuidance: {
          update: vi.fn().mockImplementation(({ data }: { data: { body: string } }) => {
            return { id: "guidance-1", body: data.body };
          }),
        },
      } as unknown as typeof db);
    });

    const result = await acceptAndFoldGuidanceNote({
      tenantId: "tenant-1",
      projectIdOrSlug: "proj-1",
      noteId: "note-1",
      userId: "user-lead",
    });

    expect(result.ok).toBe(true);
    expect(result.guidance?.body).toContain("### [RULE]: No Any Types");
    expect(result.guidance?.body).toContain("Folded from Agent Quantum-Agent");
    expect(result.guidance?.body).toContain("Strict TypeScript mode with 0 any.");
  });
});
