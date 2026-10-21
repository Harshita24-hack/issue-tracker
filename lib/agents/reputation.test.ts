import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  agent: { findMany: vi.fn() },
  agentReputation: { upsert: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  issueClaim: { findMany: vi.fn() },
  issueValidation: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  MIN_DATA_POINTS,
  NEUTRAL_REPUTATION,
  REPUTATION_WINDOW_DAYS,
  computeAgentReputation,
  median,
  readAgentReputation,
  readAgentReputationScores,
  reputationScore,
  snapshotReputations,
} from "./reputation";

beforeEach(() => {
  vi.clearAllMocks();
  db.agent.findMany.mockResolvedValue([]);
  db.agentReputation.upsert.mockResolvedValue({});
  db.agentReputation.findMany.mockResolvedValue([]);
  db.agentReputation.findUnique.mockResolvedValue(null);
  db.issueClaim.findMany.mockResolvedValue([]);
  db.issueValidation.findMany.mockResolvedValue([]);
});

const parts = {
  fixesAccepted: 0,
  fixesFailed: 0,
  validationsUpheld: 0,
  validationsOverturned: 0,
  silenceReleases: 0,
  deadlineReleases: 0,
  medianDeliverMs: null,
};

describe("reputationScore (#594)", () => {
  it("is the neutral default until there are enough data points", () => {
    expect(reputationScore({ ...parts, fixesAccepted: 1, validationsUpheld: 2 })).toEqual({
      score: NEUTRAL_REPUTATION,
      dataPoints: 3,
    });
    expect(MIN_DATA_POINTS).toBe(5);
  });

  it("is upheld work ÷ (upheld + failed) once there are enough data points", () => {
    expect(
      reputationScore({ ...parts, fixesAccepted: 4, fixesFailed: 1, validationsUpheld: 6, validationsOverturned: 1 }),
    ).toEqual({ score: 0.833, dataPoints: 12 });
  });

  it("silence and deadline releases are recorded, not failed work", () => {
    const result = reputationScore({
      ...parts,
      fixesAccepted: 3,
      validationsUpheld: 2,
      silenceReleases: 2,
      deadlineReleases: 1,
    });
    expect(result.dataPoints).toBe(5);
    expect(result.score).toBe(1);
  });

  it("a perfect failure record scores 0", () => {
    expect(reputationScore({ ...parts, fixesFailed: 4, validationsOverturned: 1 })).toEqual({
      score: 0,
      dataPoints: 5,
    });
  });

  it("takes the median of even and odd lists", () => {
    expect(median([])).toBeNull();
    expect(median([3])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 2])).toBe(3);
  });
});

describe("computeAgentReputation (#594)", () => {
  it("counts resolved, reverted and timed-out claims from the ledger", async () => {
    const now = new Date("2026-10-24T12:00:00Z");
    db.issueClaim.findMany.mockResolvedValue([
      { releasedAt: new Date("2026-10-20T12:00:00Z"), claimedAt: new Date("2026-10-20T11:00:00Z"), releaseReason: "resolved" },
      { releasedAt: new Date("2026-10-21T12:00:00Z"), claimedAt: null, releaseReason: "undo" },
      { releasedAt: new Date("2026-10-22T12:00:00Z"), claimedAt: new Date("2026-10-22T11:00:00Z"), releaseReason: "silence" },
      { releasedAt: new Date("2026-10-23T12:00:00Z"), claimedAt: new Date("2026-10-23T10:00:00Z"), releaseReason: "deadline" },
      { releasedAt: new Date("2026-10-23T13:00:00Z"), claimedAt: new Date("2026-10-23T12:00:00Z"), releaseReason: "agent" },
    ]);
    const snapshot = await computeAgentReputation("agent-1", "tenant-1", now);
    expect(snapshot.fixesAccepted).toBe(1);
    expect(snapshot.fixesFailed).toBe(1);
    expect(snapshot.silenceReleases).toBe(1);
    expect(snapshot.deadlineReleases).toBe(1);
    expect(snapshot.medianDeliverMs).toBe(3_600_000);
    expect(snapshot.score).toBe(NEUTRAL_REPUTATION);
    expect(snapshot.dataPoints).toBe(2);
    expect(db.issueClaim.findMany).toHaveBeenCalledWith({
      where: { agentId: "agent-1", releasedAt: { gte: new Date(now.getTime() - REPUTATION_WINDOW_DAYS * 86_400_000) }, releaseReason: { not: null } },
      select: { releasedAt: true, claimedAt: true, releaseReason: true },
    });
  });

  it("marks a validation overturned when a later verdict contradicts it", async () => {
    const mine = [
      { bugId: "bug-1", kind: "real", verdict: "accept", createdAt: new Date("2026-10-20T10:00:00Z") },
      { bugId: "bug-2", kind: "fix", verdict: "good", createdAt: new Date("2026-10-20T10:00:00Z") },
    ];
    const others = [
      // A later, opposite verdict overturns the first agent's judgment on bug-1.
      { bugId: "bug-1", kind: "real", verdict: "reject", createdAt: new Date("2026-10-20T11:00:00Z") },
      // An opposite verdict that came *before* the agent's own does not.
      { bugId: "bug-2", kind: "fix", verdict: "bad", createdAt: new Date("2026-10-20T09:00:00Z") },
    ];
    db.issueValidation.findMany
      .mockResolvedValueOnce(mine)
      .mockResolvedValueOnce(others);
    const snapshot = await computeAgentReputation("agent-1", "tenant-1", new Date("2026-10-24T12:00:00Z"));
    expect(snapshot.validationsUpheld).toBe(1);
    expect(snapshot.validationsOverturned).toBe(1);
  });

  it("counts a same-verdict later validation as upheld, not overturned", async () => {
    db.issueValidation.findMany
      .mockResolvedValueOnce([{ bugId: "bug-1", kind: "real", verdict: "accept", createdAt: new Date("2026-10-20T10:00:00Z") }])
      .mockResolvedValueOnce([{ bugId: "bug-1", kind: "real", verdict: "accept", createdAt: new Date("2026-10-20T11:00:00Z") }]);
    const snapshot = await computeAgentReputation("agent-1", "tenant-1", new Date("2026-10-24T12:00:00Z"));
    expect(snapshot.validationsUpheld).toBe(1);
    expect(snapshot.validationsOverturned).toBe(0);
  });
});

describe("snapshotReputations (#594)", () => {
  it("snapshots every live agent and replaces its row", async () => {
    db.agent.findMany.mockResolvedValue([
      { id: "agent-1", tenantId: "tenant-1" },
      { id: "agent-2", tenantId: "tenant-1" },
    ]);
    const result = await snapshotReputations("tenant-1");
    expect(result.snapshotted).toBe(2);
    expect(db.agent.findMany).toHaveBeenCalledWith({
      where: { revokedAt: null, tenantId: "tenant-1" },
      select: { id: true, tenantId: true },
    });
    expect(db.agentReputation.upsert).toHaveBeenCalledTimes(2);
    expect(db.agentReputation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { agentId: "agent-1" } }),
    );
  });

  it("snapshots all tenants when no tenant is given", async () => {
    db.agent.findMany.mockResolvedValue([{ id: "agent-1", tenantId: "tenant-1" }]);
    await snapshotReputations();
    expect(db.agent.findMany).toHaveBeenCalledWith({
      where: { revokedAt: null },
      select: { id: true, tenantId: true },
    });
  });
});

describe("readAgentReputation (#594)", () => {
  it("returns the stored snapshot when one exists", async () => {
    db.agentReputation.findUnique.mockResolvedValue({
      agentId: "agent-1", tenantId: "tenant-1", score: 0.9, dataPoints: 10,
      fixesAccepted: 5, fixesFailed: 1, validationsUpheld: 3, validationsOverturned: 1,
      silenceReleases: 2, deadlineReleases: 0, medianDeliverMs: 60000,
    });
    const row = await readAgentReputation("agent-1", "tenant-1");
    expect(row.score).toBe(0.9);
    expect(row.fixesAccepted).toBe(5);
    expect(row.silenceReleases).toBe(2);
  });

  it("falls back to the neutral default with an empty breakdown", async () => {
    const row = await readAgentReputation("agent-1", "tenant-1");
    expect(row.score).toBe(NEUTRAL_REPUTATION);
    expect(row.dataPoints).toBe(0);
    expect(row.medianDeliverMs).toBeNull();
  });
});

describe("readAgentReputationScores (#594)", () => {
  it("reads the stored scores into a map", async () => {
    db.agentReputation.findMany.mockResolvedValue([{ agentId: "agent-1", score: 0.9 }]);
    const scores = await readAgentReputationScores("tenant-1", ["agent-1", "agent-2"]);
    expect(scores.get("agent-1")).toBe(0.9);
    expect(scores.has("agent-2")).toBe(false);
  });

  it("stays neutral for a db double without the delegate, like the workflow dials do", async () => {
    const scores = await readAgentReputationScores("tenant-1", ["agent-1"], {} as never);
    expect(scores.size).toBe(0);
  });
});
