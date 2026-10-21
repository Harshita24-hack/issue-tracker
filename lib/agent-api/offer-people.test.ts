import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROJECT_WORKFLOW } from "@/lib/workflow-config";

/**
 * #1044: in a project where people give out work, a chosen bid's offer is the
 * only way in. Accepting it starts the work and closes the other bids; if it
 * lapses or is declined, nobody is picked automatically and the bids stay open.
 */

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  issueClaim: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn(), create: vi.fn(), groupBy: vi.fn() },
  issueBid: { updateMany: vi.fn() },
  bug: { update: vi.fn(), findFirstOrThrow: vi.fn() },
  bugActivity: { createMany: vi.fn() },
  membership: { findMany: vi.fn() },
}));
const publish = vi.hoisted(() => vi.fn(async () => ({ id: "evt" })));
const notifyClaimOffered = vi.hoisted(() => vi.fn());
const workflowFor = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/agent-api/events", () => ({ publish }));
vi.mock("@/lib/agent-api/validation", () => ({ isConfirmed: vi.fn(async () => true) }));
vi.mock("@/lib/agent-notifications", () => ({ notifyClaimOffered }));
vi.mock("@/lib/redesigns", () => ({ assertRedesignOpen: vi.fn() }));
vi.mock("@/lib/watch", () => ({ ensureWatching: vi.fn() }));
vi.mock("@/lib/workflow", async (original) => ({ ...await original<typeof import("@/lib/workflow")>(), workflowFor }));

import { acceptOffer, expireOffer, releaseClaim } from "./offer";

const agent = { agentId: "agent-ada", name: "Ada's Claude", ownerId: "ada", tenantId: "tenant", level: "contributor" as const, burst: false, keyId: "k" };
const NOW = new Date("2026-10-21T12:00:00Z");

function offer(offeredAt: Date) {
  return {
    id: "claim-1", bugId: "bug-1", agentId: "agent-ada", beneficiaryUserId: "ada", status: "offered", offeredAt,
    releasedAt: null, releaseReason: null, beneficiary: { name: "Ada" },
    bug: { id: "bug-1", title: "Broken login", status: "open", assigneeId: null, tenantId: "tenant", projectId: "p", areaId: null, voteCount: 3, severity: "medium", assignee: null },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  workflowFor.mockResolvedValue({ ...DEFAULT_PROJECT_WORKFLOW });
  db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
  db.$queryRaw.mockResolvedValue([{ id: "bug-1" }]);
  db.issueClaim.findFirst.mockResolvedValue(null);
  db.issueClaim.count.mockResolvedValue(0);
  db.bug.update.mockResolvedValue({ id: "bug-1", assigneeId: "ada", status: "in_progress" });
  db.membership.findMany.mockResolvedValue([{ userId: "bob", user: { agents: [{ id: "agent-bob", areaPreferences: [] }] } }]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a person's choice, accepted (#1044)", () => {
  it("starts the claim and its deadline, assigns the issue, and closes the other bids", async () => {
    db.issueClaim.findUnique.mockResolvedValue(offer(new Date(NOW.getTime() - 10_000)));

    const result = await acceptOffer(agent, "claim-1");

    expect(result).toMatchObject({ expired: false, claim: { status: "active", deliverBy: expect.any(Date) } });
    expect(db.issueClaim.update).toHaveBeenCalledWith({
      where: { id: "claim-1" },
      data: expect.objectContaining({ status: "active", claimedAt: NOW, deliverBy: expect.any(Date) }),
    });
    expect(db.bug.update).toHaveBeenCalledWith(expect.objectContaining({ data: { assigneeId: "ada", status: "in_progress" } }));
    expect(db.issueBid.updateMany).toHaveBeenCalledWith({
      where: { bugId: "bug-1", withdrawnAt: null, awardedAt: null, agentId: { not: "agent-ada" } },
      data: { withdrawnAt: NOW },
    });
  });
});

describe("a person's choice, not taken up (#1044)", () => {
  it("an expired offer is released, nobody else is picked, and the other bids stay open", async () => {
    const lapsed = offer(new Date(NOW.getTime() - 61_000));
    db.issueClaim.findUnique.mockResolvedValue(lapsed);

    expect(await expireOffer("claim-1")).toBe(true);

    expect(db.issueClaim.update).toHaveBeenCalledWith({
      where: { id: "claim-1" },
      data: expect.objectContaining({ status: "released", releaseReason: "expired" }),
    });
    expect(db.membership.findMany).not.toHaveBeenCalled();
    expect(db.issueClaim.create).not.toHaveBeenCalled();
    expect(db.issueBid.updateMany).not.toHaveBeenCalled();
    expect(notifyClaimOffered).not.toHaveBeenCalled();
  });

  it("a declined offer goes to nobody else either", async () => {
    db.issueClaim.findFirst.mockResolvedValue({ id: "claim-1", bugId: "bug-1", agentId: "agent-ada", beneficiaryUserId: "ada", status: "offered", beneficiary: { name: "Ada" } });
    db.bug.findFirstOrThrow.mockResolvedValue({ id: "bug-1", title: "T", status: "open", assigneeId: null, projectId: "p", areaId: null });

    const result = await releaseClaim(agent, "p", "bug-1");

    expect(result).toMatchObject({ reason: "declined", reofferedTo: null });
    expect(db.issueClaim.create).not.toHaveBeenCalled();
  });

  it("an automatic project still re-offers a lapsed offer to the next person", async () => {
    workflowFor.mockResolvedValue({ ...DEFAULT_PROJECT_WORKFLOW, assignment: "automatic" });
    db.issueClaim.findUnique.mockResolvedValue(offer(new Date(NOW.getTime() - 61_000)));
    db.issueClaim.groupBy.mockResolvedValue([]);
    db.issueClaim.create.mockResolvedValue({ id: "claim-2", bugId: "bug-1", offeredAt: NOW });

    expect(await expireOffer("claim-1")).toBe(true);

    expect(db.issueClaim.create).toHaveBeenCalledWith({ data: expect.objectContaining({ beneficiaryUserId: "bob", status: "offered" }) });
    expect(notifyClaimOffered).toHaveBeenCalledWith(expect.objectContaining({ id: "claim-2", beneficiaryUserId: "bob" }));
  });
});
