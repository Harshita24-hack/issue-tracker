import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  agentApiKey: { findUnique: vi.fn() },
  agentAuditEvent: { create: vi.fn() },
  project: { findFirst: vi.fn() },
  projectGuidance: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  projectGuidanceNote: { count: vi.fn(), findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  projectGuidanceVote: { findUnique: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));

const budget = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/agents/rate-budget", async (original) => ({
  ...(await original<typeof import("@/lib/agents/rate-budget")>()),
  consumeAgentBudget: budget,
}));

import { GET as getGuidance, PUT as putGuidance } from "./route";
import { GET as getNotes, POST as postNote } from "./notes/route";
import { POST as postUpvote } from "./notes/[noteId]/upvote/route";
import { POST as postAccept } from "./notes/[noteId]/accept/route";

const key = {
  id: "key-a",
  revokedAt: null,
  projectId: "proj-1",
  project: { slug: "web" },
  agent: {
    id: "agent-a",
    name: "Quantum-Agent",
    ownerUserId: "owner-a",
    tenantId: "tenant-a",
    level: "contributor",
    burst: false,
    revokedAt: null,
    owner: { memberships: [{ tenantId: "tenant-a" }], role: "admin" },
  },
};

function request(
  path: string,
  method = "GET",
  body?: unknown,
  keyHeader = "Bearer ziki_test",
) {
  return new NextRequest(path, {
    method,
    headers: {
      ...(keyHeader ? { authorization: keyHeader } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  db.agentApiKey.findUnique.mockResolvedValue(key);
  budget.mockResolvedValue({ allowed: true });
  db.project.findFirst.mockResolvedValue({
    id: "proj-1",
    slug: "web",
    name: "Web Project",
    tenantId: "tenant-a",
  });
  db.projectGuidance.findUnique.mockResolvedValue({
    id: "guidance-1",
    projectId: "proj-1",
    body: "# Master Guidance",
    updatedAt: new Date("2026-10-22T10:00:00Z"),
  });
  db.projectGuidanceNote.count.mockResolvedValue(0);
});

describe("GET /api/v1/projects/[id]/guidance", () => {
  it("returns master guidance for the project", async () => {
    const res = await getGuidance(
      request("http://localhost/api/v1/projects/proj-1/guidance"),
      { params: Promise.resolve({ id: "proj-1" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.body).toBe("# Master Guidance");
    expect(json.projectSlug).toBe("web");
  });
});

describe("PUT /api/v1/projects/[id]/guidance", () => {
  it("updates master guidance when owner is an admin", async () => {
    db.projectGuidance.update.mockResolvedValue({
      id: "guidance-1",
      projectId: "proj-1",
      body: "# Updated Master Guidance",
      updatedAt: new Date(),
    });

    const res = await putGuidance(
      request("http://localhost/api/v1/projects/proj-1/guidance", "PUT", {
        body: "# Updated Master Guidance",
      }),
      { params: Promise.resolve({ id: "proj-1" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.body).toBe("# Updated Master Guidance");
  });
});

describe("POST & GET /api/v1/projects/[id]/guidance/notes", () => {
  it("allows agent to post a learning note", async () => {
    const createdNote = {
      id: "note-1",
      guidanceId: "guidance-1",
      projectId: "proj-1",
      authorAgentId: "agent-a",
      category: "learning",
      title: "Test Note",
      body: "This is a valid learning body.",
      status: "pending",
      upvotes: 0,
    };
    db.projectGuidanceNote.create.mockResolvedValue(createdNote);

    const res = await postNote(
      request("http://localhost/api/v1/projects/proj-1/guidance/notes", "POST", {
        category: "learning",
        title: "Test Note",
        body: "This is a valid learning body.",
      }),
      { params: Promise.resolve({ id: "proj-1" }) },
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("note-1");
  });

  it("lists project guidance notes", async () => {
    db.projectGuidanceNote.findMany.mockResolvedValue([
      { id: "note-1", category: "learning", title: "Test Note", upvotes: 3 },
    ]);

    const res = await getNotes(
      request("http://localhost/api/v1/projects/proj-1/guidance/notes?category=learning"),
      { params: Promise.resolve({ id: "proj-1" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
  });
});

describe("POST /api/v1/projects/[id]/guidance/notes/[noteId]/upvote", () => {
  it("upvotes a note", async () => {
    db.projectGuidanceNote.findFirst.mockResolvedValue({ id: "note-1", projectId: "proj-1", upvotes: 2 });
    db.projectGuidanceVote.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => Promise<unknown>) => {
      return callback({
        projectGuidanceVote: { create: vi.fn() },
        projectGuidanceNote: {
          update: vi.fn().mockResolvedValue({ id: "note-1", upvotes: 3 }),
        },
      } as unknown as typeof db);
    });

    const res = await postUpvote(
      request("http://localhost/api/v1/projects/proj-1/guidance/notes/note-1/upvote", "POST"),
      { params: Promise.resolve({ id: "proj-1", noteId: "note-1" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.upvotes).toBe(3);
  });
});

describe("POST /api/v1/projects/[id]/guidance/notes/[noteId]/accept", () => {
  it("folds a note into master guidance", async () => {
    db.projectGuidanceNote.findFirst.mockResolvedValue({
      id: "note-1",
      guidanceId: "guidance-1",
      projectId: "proj-1",
      category: "learning",
      title: "Test Note",
      body: "Important learning text.",
      status: "pending",
      authorAgent: { id: "agent-a", name: "Quantum-Agent" },
      authorUser: null,
      guidance: { id: "guidance-1", body: "# Master Guidance" },
    });

    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => Promise<unknown>) => {
      return callback({
        projectGuidanceNote: {
          update: vi.fn().mockResolvedValue({ id: "note-1", status: "accepted" }),
        },
        projectGuidance: {
          update: vi.fn().mockResolvedValue({ id: "guidance-1", body: "# Master Guidance\n\n### [LEARNING]: Test Note\n..." }),
        },
      } as unknown as typeof db);
    });

    const res = await postAccept(
      request("http://localhost/api/v1/projects/proj-1/guidance/notes/note-1/accept", "POST"),
      { params: Promise.resolve({ id: "proj-1", noteId: "note-1" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
