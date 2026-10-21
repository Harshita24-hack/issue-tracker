import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROJECT_WORKFLOW } from "@/lib/workflow-config";
import { IssueApiError } from "@/lib/agent-api/issues";

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  bug: { findFirst: vi.fn() },
  issueClaim: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
}));
const isConfirmed = vi.hoisted(() => vi.fn());
const notifyClaimOffered = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/agent-api/validation", () => ({ isConfirmed }));
vi.mock("@/lib/agent-notifications", () => ({ notifyClaimOffered }));
vi.mock("@/lib/redesigns", () => ({ assertRedesignOpen: vi.fn() }));
const workflowFor = vi.hoisted(() => vi.fn());
// These tests cover a project with automatic offers; #1044 made that opt-in.
vi.mock("@/lib/workflow", async (original) => ({ ...await original<typeof import("@/lib/workflow")>(), workflowFor }));

import { offerIssue } from "./offer";

const agent = {
  agentId: "agent-ada",
  name: "Ada's Claude",
  ownerId: "ada",
  tenantId: "tenant",
  level: "contributor" as const,
  burst: false,
  keyId: "key-ada",
};

const pendingOffer = {
  id: "claim-existing",
  bugId: "bug-1",
  agentId: "agent-bob",
  beneficiaryUserId: "bob",
  status: "offered",
  offeredAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  workflowFor.mockResolvedValue({ ...DEFAULT_PROJECT_WORKFLOW, assignment: "automatic" });
  db.$queryRaw.mockResolvedValue([{ id: "bug-1" }]);
  db.$transaction.mockImplementation((run: (tx: unknown) => unknown) => run(db));
  db.bug.findFirst.mockResolvedValue({
    id: "bug-1",
    title: "Example",
    projectId: "project-1",
    status: "open",
    assigneeId: null,
    voteCount: 3,
  });
  db.issueClaim.findFirst.mockResolvedValue(pendingOffer);
  isConfirmed.mockResolvedValue(true);
});

describe("people give out work (#1044)", () => {
  it("refuses an agent's offer request with 409 assignment_by_people, before touching claims", async () => {
    workflowFor.mockResolvedValue({ ...DEFAULT_PROJECT_WORKFLOW });
    const error = await offerIssue(agent, "project-1", "bug-1").catch((caught) => caught);
    expect(error).toBeInstanceOf(IssueApiError);
    expect(error).toMatchObject({ status: 409, message: "assignment_by_people" });
    expect(error.body.message).toContain("/bid");
    expect(db.issueClaim.findFirst).not.toHaveBeenCalled();
    expect(db.issueClaim.create).not.toHaveBeenCalled();
  });
});

describe("manual issue offers (#590)", () => {
  it("returns an existing pending offer instead of creating another one", async () => {
    const result = await offerIssue(agent, "project-1", "bug-1");

    expect(result).toBe(pendingOffer);
    expect(db.issueClaim.create).not.toHaveBeenCalled();
    expect(db.issueClaim.update).not.toHaveBeenCalled();
    expect(notifyClaimOffered).not.toHaveBeenCalled();
  });
  it("blocks with 409 waiting_for_human when human approval is required before offer (#598)", async () => {
    (db as Record<string, unknown>).approvalRule = {
      findMany: vi.fn(async () => [
        { id: "rule-1", stage: "before_offer", issueTypeId: null, severity: null, fileGlob: null },
      ]),
    };
    (db as Record<string, unknown>).issueApproval = {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "appr-wait", status: "pending" })),
    };
    (db as Record<string, unknown>).membership = {
      findMany: vi.fn(async () => []),
    };
    (db as Record<string, unknown>).agentEvent = {
      create: vi.fn(async () => ({ id: "event-1" })),
    };
    (db as Record<string, unknown>).webhookSubscription = {
      findMany: vi.fn(async () => []),
    };

    let error: IssueApiError | null = null;
    try {
      await offerIssue(agent, "project-1", "bug-1");
    } catch (e) {
      error = e as IssueApiError;
    }

    expect(error).toBeInstanceOf(IssueApiError);
    expect(error?.status).toBe(409);
    expect(error?.message).toBe("waiting_for_human");
    expect(error?.body).toEqual({ approvalId: "appr-wait" });
  });
});