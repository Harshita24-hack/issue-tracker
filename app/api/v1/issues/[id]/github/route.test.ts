import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const agent = {
  agentId: "agent1",
  name: "Ada's Claude",
  ownerId: "ada",
  tenantId: "tenant",
  level: "contributor" as const,
  burst: false,
  keyId: "key1",
  projectId: "project_a",
  projectSlug: "web",
};

const bug = { id: "issue_b", projectId: "project_b", pullRequestUrl: null, project: { repoUrl: null, githubInstallationId: null } };

const prisma = vi.hoisted(() => ({ bug: { findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/agents/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/agents/rate-budget", () => ({
  consumeAgentBudget: vi.fn(async () => ({ allowed: true, remaining: 29, limit: 30, resetSeconds: 3600 })),
  agentBudgetExceededResponse: vi.fn(),
}));
vi.mock("@/lib/agents/rate-budget-headers", () => ({ withAgentBudgetHeaders: (response: Response) => response }));
vi.mock("@/lib/agents/require-agent", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agents/require-agent")>("@/lib/agents/require-agent");
  return { ...actual, requireAgent: vi.fn(async () => agent) };
});
vi.mock("@/lib/github/link-pr", () => ({ linkPullRequest: vi.fn() }));
vi.mock("@/lib/github/merge-pr", () => ({
  clientForInstallation: vi.fn(() => null),
  mergeAcceptedFix: vi.fn(),
  parseGitHubRepoUrl: vi.fn(() => null),
  parsePullRequestUrl: vi.fn(() => ({ owner: "o", repo: "r", number: 1 })),
  sameRepo: vi.fn(() => true),
  standingAcceptance: vi.fn(async () => null),
}));

import { linkPullRequest } from "@/lib/github/link-pr";
import { mergeAcceptedFix } from "@/lib/github/merge-pr";
import { POST } from "./route";

function request() {
  return new NextRequest("https://ziki.dev/api/v1/issues/issue_b/github", {
    method: "POST",
    headers: { authorization: "Bearer ziki_test", "content-type": "application/json" },
    body: JSON.stringify({ pullRequestUrl: "https://github.com/o/r/pull/1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.bug.findFirst.mockResolvedValue(bug);
});

describe("POST /api/v1/issues/{id}/github project scope (#529)", () => {
  it("refuses a project-scoped key on another project's issue before linking", async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: "issue_b" }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "project_forbidden",
      message: "This agent key is restricted to project web.",
    });
    expect(linkPullRequest).not.toHaveBeenCalled();
    expect(mergeAcceptedFix).not.toHaveBeenCalled();
  });
});
