import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * #1048: designs keep their revisions, and talking about them happens in the
 * linked issue's conversation: proposing, revising and deciding each post a
 * `design` entry, and feedback is an ordinary reply to it.
 */

const db = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  membership: { findUnique: vi.fn() },
  bug: { findFirst: vi.fn() },
  redesignProposal: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  designRevision: { create: vi.fn(), findFirst: vi.fn() },
  attachment: { updateMany: vi.fn() },
  comment: { create: vi.fn() },
  agentApiKey: { findUnique: vi.fn() },
  agentAuditEvent: { create: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
const mocks = vi.hoisted(() => ({ publish: vi.fn(), budget: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/agent-api/events", () => ({ publish: mocks.publish }));
vi.mock("@/lib/agent-notifications", () => ({ notifyApprovalNeeded: vi.fn() }));
vi.mock("@/lib/agents/rate-budget", async (original) => ({ ...await original<typeof import("@/lib/agents/rate-budget")>(), consumeAgentBudget: mocks.budget }));

import { addDesignRevision, decideRedesign, proposeRedesign, readDesign } from "./redesigns";
import { POST as reviseViaAlias } from "@/app/api/v1/designs/[id]/revisions/route";
import { GET as readViaAlias } from "@/app/api/v1/designs/[id]/route";

const agent = { agentId: "agent", name: "Helper", ownerId: "owner", tenantId: "tenant", level: "contributor" as const, burst: false, keyId: "key" };
const stored = { id: "proposal", title: "A calmer header", status: "proposed", bugId: "issue", authorAgentId: "agent", onBehalfOfUserId: "owner", projectId: "project" };
const revisionBody = { body: "Tighter spacing, and the switcher moves into the menu.", previewUrl: "https://preview.example/2", attachmentIds: [] };

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((run: (tx: typeof db) => unknown) => run(db));
  db.project.findFirst.mockResolvedValue({ id: "project" });
  db.membership.findUnique.mockResolvedValue({ userId: "owner", role: "admin" });
  db.bug.findFirst.mockResolvedValue({ id: "issue" });
  db.redesignProposal.findFirst.mockResolvedValue(stored);
  db.redesignProposal.updateMany.mockResolvedValue({ count: 1 });
  db.designRevision.findFirst.mockResolvedValue({ number: 1 });
  db.designRevision.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `rev-${data.number}`, ...data, createdAt: new Date() }));
  db.comment.create.mockResolvedValue({ id: "entry" });
  db.attachment.updateMany.mockResolvedValue({ count: 0 });
  db.agentApiKey.findUnique.mockResolvedValue({ id: "key", revokedAt: null, agent: {
    id: "agent", name: "Helper", ownerUserId: "owner", tenantId: "tenant", level: "contributor", burst: false, revokedAt: null, owner: { memberships: [{ tenantId: "tenant" }] },
  } });
  mocks.budget.mockResolvedValue({ allowed: true });
  mocks.publish.mockResolvedValue({ id: "evt" });
});

describe("proposing a design (#1048)", () => {
  it("stores it as revision 1 and posts a design entry in the issue's conversation", async () => {
    db.redesignProposal.create.mockResolvedValue({ ...stored, body: "A first take on the header.", previewUrl: null });
    await proposeRedesign(agent, { projectId: "project", bugId: "issue", title: "A calmer header", body: "A first take on the header.", attachmentIds: [] });
    expect(db.designRevision.create).toHaveBeenCalledWith({ data: expect.objectContaining({ proposalId: "proposal", number: 1, authorAgentId: "agent" }) });
    expect(db.comment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bugId: "issue", authorId: "owner", agentId: "agent", type: "design",
        body: "Proposed a design: A calmer header\n\nA first take on the header.",
        metadata: { proposalId: "proposal", revision: 1 },
      }),
      select: { id: true },
    });
  });
});

describe("addDesignRevision (#1048)", () => {
  it("adds the next revision, makes it the proposal's latest, and posts it in the conversation", async () => {
    const revision = await addDesignRevision(agent, "proposal", revisionBody);
    expect(revision).toMatchObject({ number: 2 });
    expect(db.redesignProposal.update).toHaveBeenCalledWith({ where: { id: "proposal" }, data: { body: revisionBody.body, previewUrl: revisionBody.previewUrl } });
    expect(db.comment.create.mock.calls[0][0].data).toMatchObject({
      type: "design",
      body: expect.stringContaining('Revised the design "A calmer header" (revision 2)'),
      metadata: { proposalId: "proposal", revision: 2, previewUrl: revisionBody.previewUrl },
    });
    expect(mocks.publish).toHaveBeenCalledWith(db, expect.objectContaining({ type: "redesign.revised", payload: expect.objectContaining({ revision: 2 }) }));
  });

  it("links a revision's mockups to that revision", async () => {
    db.attachment.updateMany.mockResolvedValue({ count: 1 });
    await addDesignRevision(agent, "proposal", { ...revisionBody, attachmentIds: ["mock-2"] });
    expect(db.attachment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: ["mock-2"] }, uploaderId: "owner" }),
      data: { redesignProposalId: "proposal", designRevisionId: "rev-2" },
    }));
  });

  it("is only for the proposing agent, and only while the design waits for a person", async () => {
    await expect(addDesignRevision({ ...agent, agentId: "other" }, "proposal", revisionBody)).rejects.toMatchObject({ status: 403 });
    db.redesignProposal.findFirst.mockResolvedValue({ ...stored, status: "approved" });
    await expect(addDesignRevision(agent, "proposal", revisionBody)).rejects.toMatchObject({ status: 409 });
    db.redesignProposal.findFirst.mockResolvedValue(null);
    await expect(addDesignRevision(agent, "proposal", revisionBody)).rejects.toMatchObject({ status: 404 });
    expect(db.designRevision.create).not.toHaveBeenCalled();
  });
});

describe("readDesign (#1048)", () => {
  it("returns every revision, oldest first, each with its own mockups", async () => {
    db.redesignProposal.findFirst.mockResolvedValue({
      ...stored,
      revisions: [{ id: "rev-1", number: 1, body: "First" }, { id: "rev-2", number: 2, body: "Second" }],
      attachments: [
        { id: "a1", filename: "v1.png", contentType: "image/png", designRevisionId: null },
        { id: "a2", filename: "v2.png", contentType: "image/png", designRevisionId: "rev-2" },
      ],
    });
    const design = await readDesign(agent, "proposal");
    expect(design.revisions.map((revision) => [revision.number, revision.attachments.map((file) => file.id)])).toEqual([[1, ["a1"]], [2, ["a2"]]]);
    expect(db.redesignProposal.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "proposal", tenantId: "tenant" } }));
  });
});

describe("a person's decision (#1048)", () => {
  it("posts a design entry for the choice in the issue's conversation", async () => {
    db.redesignProposal.findFirst.mockResolvedValue({ ...stored, authorAgent: { ownerUserId: "someone-else" } });
    await decideRedesign("owner", "tenant", "proposal", "chosen");
    expect(db.comment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ bugId: "issue", authorId: "owner", agentId: null, type: "design", body: 'Chose the design "A calmer header".', metadata: { proposalId: "proposal", decision: "chosen" } }),
      select: { id: true },
    });
  });
});

describe("/api/v1/designs aliases (#1048)", () => {
  const context = { params: Promise.resolve({ id: "proposal" }) };
  function request(method: string, body?: unknown) {
    return new NextRequest("http://localhost/api/v1/designs/proposal/revisions", {
      method,
      headers: { authorization: "Bearer ziki_test", "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  it("adds a revision", async () => {
    const response = await reviseViaAlias(request("POST", revisionBody), context);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ revision: { number: 2 } });
  });

  it("reads a design with its revisions", async () => {
    db.redesignProposal.findFirst.mockResolvedValue({ ...stored, revisions: [{ id: "rev-1", number: 1 }], attachments: [] });
    const response = await readViaAlias(request("GET"), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ design: { id: "proposal", revisions: [{ number: 1 }] } });
  });
});
