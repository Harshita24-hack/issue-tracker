import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1045: an agent has one way to take a step. A `validation` comment with a
 * verdict validates, a `merge` comment accepts the fix, and a `delivery`
 * comment with a pullRequestUrl links the PR — each through the same gates as
 * its own route.
 */

const m = vi.hoisted(() => ({
  db: {
    project: { findFirst: vi.fn() },
    bug: { findFirst: vi.fn(), update: vi.fn() },
    comment: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    bugActivity: { create: vi.fn() },
    issueWatch: { upsert: vi.fn() },
    user: { findMany: vi.fn() },
    attachment: { findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  submitValidation: vi.fn(),
  acceptFix: vi.fn(),
  linkPullRequest: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: m.db }));
vi.mock("@/lib/agent-api/validation", () => ({ submitValidation: m.submitValidation, isConfirmed: vi.fn() }));
vi.mock("@/lib/agent-api/merge", () => ({ acceptFix: m.acceptFix }));
vi.mock("@/lib/agent-api/link-pr", async (original) => ({
  ...await original<typeof import("@/lib/agent-api/link-pr")>(),
  linkPullRequest: m.linkPullRequest,
}));
vi.mock("@/lib/agents/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/agent-api/events", () => ({ publish: vi.fn(async () => ({ id: "evt" })) }));
vi.mock("@/lib/notify", () => ({ notifyLater: vi.fn() }));

import { commentOnAgentIssue, IssueApiError } from "./issues";

const agent = { agentId: "agent-ada", name: "Ada's agent", ownerId: "ada", tenantId: "tenant", level: "reviewer" as const, burst: false, keyId: "k" };

function post(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/v1/issues/bug-1/comments?projectId=project-1", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.db.project.findFirst.mockResolvedValue({ id: "project-1" });
  m.db.bug.findFirst.mockResolvedValue({
    id: "bug-1", title: "Broken login", reporterId: "rep", assigneeId: "ada",
    repositoryUrl: "https://github.com/acme/web", project: { repoUrl: "https://github.com/acme/web" },
  });
  m.db.comment.findMany.mockResolvedValue([]);
  m.db.user.findMany.mockResolvedValue([]);
  m.db.comment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "c-new", ...data }));
  m.db.$transaction.mockImplementation(async (run: (tx: typeof m.db) => unknown) => run(m.db));
});

describe("a validation comment validates (#1045)", () => {
  it("runs the validation with the comment's text as its notes, and returns the entry it posted", async () => {
    m.submitValidation.mockResolvedValue({ status: 201, validation: { id: "v1" }, confirmed: true, newlyConfirmed: true, commentId: "entry-1" });
    m.db.comment.findUnique.mockResolvedValue({ id: "entry-1", type: "validation" });

    const response = await commentOnAgentIssue(agent, post({ type: "validation", kind: "real", verdict: "accept", severity: "high", body: "Reproduced it." }), "bug-1");

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ comment: { id: "entry-1", type: "validation" }, confirmed: true, newlyConfirmed: true });
    expect(m.submitValidation).toHaveBeenCalledWith(agent, "bug-1", { kind: "real", verdict: "accept", notes: "Reproduced it.", severity: "high" }, { parentId: null });
    // The validation posted its own entry; no second plain comment.
    expect(m.db.comment.create).not.toHaveBeenCalled();
  });

  it("answers with the validation's own refusal", async () => {
    m.submitValidation.mockResolvedValue({ status: 403, error: "not_independent", message: "Not independent." });
    const response = await commentOnAgentIssue(agent, post({ type: "validation", kind: "real", verdict: "accept", severity: "high", body: "Looks real." }), "bug-1");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_independent", message: "Not independent." });
  });

  it("refuses validation fields on any other comment", async () => {
    await expect(commentOnAgentIssue(agent, post({ type: "comment", verdict: "accept", body: "Hi" }), "bug-1"))
      .rejects.toMatchObject({ status: 422 });
    expect(m.submitValidation).not.toHaveBeenCalled();
  });
});

describe("a merge comment accepts the fix (#1045)", () => {
  it("runs the merge gate and returns the merge entry", async () => {
    m.acceptFix.mockResolvedValue({ status: 200, accepted: true, solverUserId: "bob", rewardedReviewerUserIds: [] });
    m.db.comment.findFirst.mockResolvedValue({ id: "entry-2", type: "merge" });
    const response = await commentOnAgentIssue(agent, post({ type: "merge", body: "Merging after checks." }), "bug-1");
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ comment: { id: "entry-2" }, accepted: true, solverUserId: "bob" });
    expect(m.acceptFix).toHaveBeenCalledWith(agent, "bug-1", { parentId: null, note: "Merging after checks." });
  });

  it("answers with the gate's refusal", async () => {
    m.acceptFix.mockResolvedValue({ status: 409, error: "not_ready", missing: "verdicts", message: "Needs verdicts." });
    const response = await commentOnAgentIssue(agent, post({ type: "merge", body: "Merge it." }), "bug-1");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ missing: "verdicts" });
  });
});

describe("a delivery comment's pullRequestUrl (#1045)", () => {
  it("is 422 when it isn't a GitHub pull request, or is in another repository", async () => {
    for (const pullRequestUrl of ["https://gitlab.com/acme/web/-/merge_requests/3", "not a url", "https://github.com/acme/api/pull/3"]) {
      const error = await commentOnAgentIssue(agent, post({ type: "delivery", body: "Fixed.", pullRequestUrl }), "bug-1").catch((caught) => caught);
      expect(error).toBeInstanceOf(IssueApiError);
      expect(error).toMatchObject({ status: 422, body: { field: "pullRequestUrl" } });
    }
    expect(m.linkPullRequest).not.toHaveBeenCalled();
    expect(m.db.comment.create).not.toHaveBeenCalled();
  });

  it("links a valid one, then posts the delivery with the PR in a field", async () => {
    m.linkPullRequest.mockResolvedValue({ status: 200, body: { linked: true, merged: false, reason: "not_accepted" } });
    const url = "https://github.com/acme/web/pull/42";
    const response = await commentOnAgentIssue(agent, post({ type: "delivery", body: "Fixed the overlap.", pullRequestUrl: url }), "bug-1");
    expect(response.status).toBe(201);
    expect(m.linkPullRequest).toHaveBeenCalledWith(agent, "bug-1", url);
    expect(m.db.comment.create.mock.calls[0][0].data).toMatchObject({ type: "delivery", metadata: { pullRequestUrl: url } });
    expect(await response.json()).toMatchObject({ link: { linked: true } });
  });

  it("posts nothing when the link is refused", async () => {
    m.linkPullRequest.mockResolvedValue({ status: 409, body: { error: "Accept an offer before linking a fix." } });
    const response = await commentOnAgentIssue(agent, post({ type: "delivery", body: "Fixed.", pullRequestUrl: "https://github.com/acme/web/pull/42" }), "bug-1");
    expect(response.status).toBe(409);
    expect(m.db.comment.create).not.toHaveBeenCalled();
  });

  it("only goes with a delivery", async () => {
    await expect(commentOnAgentIssue(agent, post({ type: "comment", body: "See PR", pullRequestUrl: "https://github.com/acme/web/pull/42" }), "bug-1"))
      .rejects.toMatchObject({ status: 422 });
  });
});

describe("an escalation comment (#1045)", () => {
  it("points to the escalations route, which posts the entry", async () => {
    await expect(commentOnAgentIssue(agent, post({ type: "escalation", body: "Need a decision." }), "bug-1"))
      .rejects.toMatchObject({ status: 422, message: expect.stringContaining("/api/v1/escalations") });
  });
});
