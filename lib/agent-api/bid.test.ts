import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const mock = {
    bug: { findFirst: vi.fn(), update: vi.fn() },
    bugActivity: { createMany: vi.fn() },
    issueBid: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    issueClaim: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    projectWorkflow: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  mock.$transaction.mockImplementation((fn: (tx: typeof mock) => unknown) => fn(mock));
  return mock;
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/agent-api/validation", () => ({ isConfirmed: vi.fn(async () => true) }));
vi.mock("@/lib/redesigns", () => ({ assertRedesignOpen: vi.fn(async () => undefined) }));
vi.mock("@/lib/agent-api/events", () => ({ publish: vi.fn(async () => ({ id: "evt" })) }));
vi.mock("@/lib/watch", () => ({ ensureWatching: vi.fn(async () => undefined) }));
vi.mock("@/lib/agents/membership", () => ({ isTenantAdmin: vi.fn(async () => false) }));
vi.mock("@/lib/agent-notifications", () => ({ notifyClaimOffered: vi.fn() }));

import { isConfirmed } from "@/lib/agent-api/validation";
import { publish } from "@/lib/agent-api/events";
import { awardBid, listBids, placeBid, withdrawBid } from "./bid";
import { resetWorkflowCache } from "@/lib/workflow";
import { notifyClaimOffered } from "@/lib/agent-notifications";

const caller = {
  agentId: "agent1",
  name: "Ada's Claude",
  ownerId: "ada",
  tenantId: "tenant",
  level: "contributor" as const,
  burst: false,
  keyId: "key1",
};

const openBug = {
  id: "issue1",
  title: "Broken login",
  projectId: "project",
  status: "open" as const,
  assigneeId: null,
  tenantId: "tenant",
  reporterId: "reporter",
  isDeleted: false,
  assignee: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  resetWorkflowCache();
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.$queryRaw.mockResolvedValue([{ id: "issue1" }]);
  db.bug.findFirst.mockResolvedValue({ id: "issue1", projectId: "project", status: "open" });
  db.issueClaim.findFirst.mockResolvedValue(null);
  db.issueClaim.count.mockResolvedValue(0);
  db.projectWorkflow.findUnique.mockResolvedValue(null);
  db.issueBid.updateMany.mockResolvedValue({ count: 1 });
  db.issueBid.findUnique.mockResolvedValue(null);
  db.issueBid.create.mockResolvedValue({ id: "bid1", beneficiaryUserId: "ada" });
  vi.mocked(isConfirmed).mockResolvedValue(true);
});

describe("placeBid", () => {
  it("records a bid and does not claim the issue", async () => {
    const bid = await placeBid(caller, "project", "issue1", "I can fix the login");
    expect(bid.id).toBe("bid1");
    expect(db.issueClaim.create).not.toHaveBeenCalled();
    expect(db.bug.update).not.toHaveBeenCalled();
    expect(db.issueBid.create.mock.calls[0][0].data).toMatchObject({
      bugId: "issue1",
      agentId: "agent1",
      beneficiaryUserId: "ada",
      note: "I can fix the login",
    });
    expect(publish).toHaveBeenCalledWith(db, expect.objectContaining({ type: "issue.bid" }));
  });

  it("returns the open bid instead of creating another", async () => {
    db.issueBid.findUnique.mockResolvedValue({ id: "bid1", awardedAt: null, withdrawnAt: null });
    await expect(placeBid(caller, "project", "issue1")).resolves.toMatchObject({ id: "bid1" });
    expect(db.issueBid.create).not.toHaveBeenCalled();
  });

  it("uses the project's active-claim cap (#595)", async () => {
    db.projectWorkflow.findUnique.mockResolvedValue({ maxActiveClaims: 1 });
    db.issueClaim.count.mockResolvedValue(1);
    await expect(placeBid(caller, "project", "issue1")).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("maximum number of active tasks"),
    });
    expect(db.issueBid.create).not.toHaveBeenCalled();
  });

  it("refuses an issue that is not confirmed or is already being worked", async () => {
    vi.mocked(isConfirmed).mockResolvedValue(false);
    await expect(placeBid(caller, "project", "issue1")).rejects.toMatchObject({ status: 409 });
    vi.mocked(isConfirmed).mockResolvedValue(true);
    db.issueClaim.findFirst.mockResolvedValue({ id: "claim", status: "active", offeredAt: null });
    await expect(placeBid(caller, "project", "issue1")).rejects.toMatchObject({ status: 409 });
    db.issueClaim.findFirst.mockResolvedValue({ id: "offer", status: "offered", offeredAt: new Date() });
    await expect(placeBid(caller, "project", "issue1")).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("pending offer"),
    });
    expect(db.issueBid.create).not.toHaveBeenCalled();
  });
});

describe("listBids area preference (#609)", () => {
  it("ranks matching-area volunteers first without hiding other bids", async () => {
    db.bug.findFirst.mockResolvedValue({ id: "issue1", areaId: "area-web" });
    db.issueBid.findMany.mockResolvedValue([
      { id: "bid-other", createdAt: new Date("2026-10-19T10:00:00Z"), agent: { name: "Other", areaPreferences: [] } },
      { id: "bid-match", createdAt: new Date("2026-10-19T11:00:00Z"), agent: { name: "Match", areaPreferences: [{ projectAreaId: "area-web" }] } },
    ]);
    const bids = await listBids(caller, "project", "issue1");
    expect(bids.map((bid) => bid.id)).toEqual(["bid-match", "bid-other"]);
    expect(bids.map((bid) => bid.areaMatch)).toEqual([true, false]);
  });
});

describe("awardBid", () => {
  const stored = {
    id: "bid1",
    bugId: "issue1",
    agentId: "agent1",
    beneficiaryUserId: "ada",
    withdrawnAt: null,
    awardedAt: null,
    beneficiary: { name: "Ada" },
    bug: openBug,
  };

  it("turns the reporter's choice into an offer the agent accepts, not an active claim (#1044)", async () => {
    db.issueBid.findUnique.mockResolvedValue(stored);
    db.issueClaim.create.mockResolvedValue({ id: "claim1" });
    await expect(awardBid({ id: "reporter" }, "bid1")).resolves.toMatchObject({
      bidId: "bid1",
      claimId: "claim1",
      bugId: "issue1",
      expiresAt: expect.any(String),
    });
    const data = db.issueClaim.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "offered", agentId: "agent1", beneficiaryUserId: "ada" });
    expect(data.offeredAt).toBeInstanceOf(Date);
    expect(data.claimedAt).toBeUndefined();
    expect(data.deliverBy).toBeUndefined();
    // Accepting assigns the issue and starts the work, not choosing.
    expect(db.bug.update).not.toHaveBeenCalled();
    expect(db.issueBid.updateMany).toHaveBeenCalledTimes(1);
    expect(db.issueBid.updateMany).toHaveBeenCalledWith({
      where: { id: "bid1", awardedAt: null, withdrawnAt: null },
      data: expect.objectContaining({ claimId: "claim1" }),
    });
    const types = vi.mocked(publish).mock.calls.map(([, event]) => event.type);
    expect(types).toEqual(["claim.offered", "issue.bid_awarded"]);
    expect(notifyClaimOffered).toHaveBeenCalledWith(expect.objectContaining({ id: "claim1", beneficiaryUserId: "ada" }));
  });

  it("leaves the other bids open, so a person can choose again (#1044)", async () => {
    db.issueBid.findUnique.mockResolvedValue(stored);
    db.issueClaim.create.mockResolvedValue({ id: "claim1" });
    await awardBid({ id: "reporter" }, "bid1");
    expect(db.issueBid.updateMany.mock.calls.some(([call]) => call.data.withdrawnAt)).toBe(false);
  });

  it("refuses a second choice while the first offer is live, and releases a lapsed one first (#1044)", async () => {
    db.issueBid.findUnique.mockResolvedValue(stored);
    db.issueClaim.findFirst.mockResolvedValue({ id: "offer0", status: "offered", offeredAt: new Date(), bug: { tenantId: "tenant", projectId: "project" } });
    await expect(awardBid({ id: "reporter" }, "bid1")).rejects.toMatchObject({ status: 409, message: expect.stringContaining("pending offer") });
    expect(db.issueClaim.create).not.toHaveBeenCalled();

    db.issueClaim.findFirst.mockResolvedValue({
      id: "offer0", status: "offered", offeredAt: new Date(Date.now() - 61_000), agentId: "agent2", beneficiaryUserId: "bob",
      bug: { tenantId: "tenant", projectId: "project" },
    });
    db.issueClaim.create.mockResolvedValue({ id: "claim1" });
    await awardBid({ id: "reporter" }, "bid1");
    expect(db.issueClaim.update).toHaveBeenCalledWith({
      where: { id: "offer0" },
      data: expect.objectContaining({ status: "released", releaseReason: "expired" }),
    });
    expect(db.issueClaim.create).toHaveBeenCalledTimes(1);
  });

  it("refuses someone who did not report the issue and is not an admin", async () => {
    db.issueBid.findUnique.mockResolvedValue(stored);
    await expect(awardBid({ id: "bob" }, "bid1")).rejects.toMatchObject({ status: 403 });
    expect(db.issueClaim.create).not.toHaveBeenCalled();
  });
});

describe("withdrawBid", () => {
  it("withdraws the caller's open bid", async () => {
    db.issueBid.findUnique.mockResolvedValue({
      id: "bid1",
      awardedAt: null,
      withdrawnAt: null,
      bug: { tenantId: "tenant", projectId: "project", isDeleted: false },
    });
    await withdrawBid(caller, "project", "issue1");
    expect(db.issueBid.updateMany.mock.calls[0][0].data.withdrawnAt).toBeInstanceOf(Date);
    expect(publish).toHaveBeenCalledWith(db, expect.objectContaining({ type: "issue.bid_withdrawn" }));
  });
});
