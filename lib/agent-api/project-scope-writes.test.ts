import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  bug: { findFirst: vi.fn(), findUnique: vi.fn() },
  issueClaim: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import type { AgentContext } from "@/lib/agents/require-agent";
import { submitValidation } from "./validation";
import { submitTestVerdict } from "./test-verdict";
import { acceptFix } from "./merge";

const agent: AgentContext = {
  agentId: "agent1",
  name: "Ada's Claude",
  ownerId: "ada",
  tenantId: "tenant",
  level: "merger",
  burst: false,
  keyId: "key1",
  projectId: "project_a",
  projectSlug: "web",
};

const foreignBug = {
  id: "issue_b",
  tenantId: "tenant",
  projectId: "project_b",
  title: "Other project's issue",
  status: "open" as const,
  assigneeId: null,
  voteCount: 3,
  severity: "high" as const,
  reporterId: "reporter",
  beneficiaryUserId: "reporter",
  duplicateOfId: null,
  createdByAgentId: "agent_reporter",
  createdByAgent: { ownerUserId: "someone_else" },
  claims: [],
};

const denied = {
  status: 403,
  error: "project_forbidden",
  message: "This agent key is restricted to project web.",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.bug.findFirst.mockResolvedValue(foreignBug);
  db.bug.findUnique.mockResolvedValue(foreignBug);
  db.issueClaim.findFirst.mockResolvedValue(null);
});

describe("project-scoped keys cannot act on another project's issue (#529)", () => {
  it("refuses a validation before any write", async () => {
    await expect(
      submitValidation(agent, "issue_b", { kind: "real", verdict: "accept", severity: "high" }),
    ).resolves.toEqual(denied);
  });

  it("refuses a test verdict", async () => {
    await expect(submitTestVerdict(agent, "issue_b", { goodToMerge: true })).resolves.toEqual(denied);
  });

  it("refuses accepting a fix", async () => {
    await expect(acceptFix(agent, "issue_b")).resolves.toEqual(denied);
  });

  it("still allows a key scoped to the issue's own project", async () => {
    db.bug.findFirst.mockResolvedValue({ ...foreignBug, projectId: "project_a" });

    // Passes the scope gate and fails later on an unrelated workflow rule,
    // which is enough to prove the scope check does not over-reject.
    const result = await submitValidation(agent, "issue_b", { kind: "real", verdict: "accept", severity: "high" })
      .catch(() => ({ error: "threw" }));
    expect(result).not.toMatchObject({ error: "project_forbidden" });
  });

  it("allows a legacy key with no project restriction", async () => {
    db.bug.findFirst.mockResolvedValue(foreignBug);
    const legacy = { ...agent, projectId: null, projectSlug: null };

    const result = await acceptFix(legacy, "issue_b").catch(() => ({ error: "threw" }));
    expect(result).not.toMatchObject({ error: "project_forbidden" });
  });
});
