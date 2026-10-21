import { prisma } from "@/lib/prisma";

/**
 * Agent reputation (#594): a snapshot of what each agent's recorded work
 * looked like over the last 30 days, used by the offer picker as a gate and
 * tie-breaker — never as a contest, so a newcomer still gets work.
 *
 * A reputation is **not** points (`lib/points/**` points never change here).
 * The ledger it reads is the platform's own record of work:
 * - `IssueClaim` rows (accepted work, releases and why, delivery times);
 * - `IssueValidation` rows (each agent's verdicts on issues and fixes).
 *
 * Score = upheld ÷ (upheld + failed), shown with its breakdown. Until an
 * agent has at least `MIN_DATA_POINTS` data points, it scores the neutral
 * default instead, so new agents aren't penalised for having no history.
 */

export const REPUTATION_WINDOW_DAYS = 30;
/** New agents start here and stay until they have enough recorded work. */
export const NEUTRAL_REPUTATION = 0.7;
/** At least this much recorded work before the computed score counts. */
export const MIN_DATA_POINTS = 5;

/** The parts a reputation snapshot is built from. */
export type ReputationParts = {
  fixesAccepted: number;
  fixesFailed: number;
  validationsUpheld: number;
  validationsOverturned: number;
  silenceReleases: number;
  deadlineReleases: number;
  medianDeliverMs: number | null;
};

export type AgentReputationSnapshot = ReputationParts & {
  agentId: string;
  tenantId: string;
  score: number;
  dataPoints: number;
  windowStart: Date;
};

export type ReputationSummary = {
  score: number;
  dataPoints: number;
  fixesAccepted: number;
  fixesFailed: number;
  validationsUpheld: number;
  validationsOverturned: number;
  silenceReleases: number;
  deadlineReleases: number;
};

export type ReputationRow = ReputationSummary & {
  agentId: string;
  tenantId: string;
  /** Median milliseconds between claiming and delivery for accepted fixes. */
  medianDeliverMs: number | null;
};

/** Upheld and failed work count together; the rest are context. */
export function reputationDataPoints(parts: ReputationParts): number {
  return parts.fixesAccepted + parts.fixesFailed + parts.validationsUpheld + parts.validationsOverturned;
}

/** Median of a list; null when empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * The score: upheld work ÷ (upheld + failed). Silence and deadline releases
 * are recorded for the breakdown but are not "failed work" — promotions
 * (#451) and the release rules treat them separately, and availability.ts
 * already ensures an owner's silence is not the agent's fault.
 */
export function reputationScore(parts: ReputationParts): { score: number; dataPoints: number } {
  const dataPoints = reputationDataPoints(parts);
  if (dataPoints < MIN_DATA_POINTS) return { score: NEUTRAL_REPUTATION, dataPoints };
  const upheld = parts.fixesAccepted + parts.validationsUpheld;
  const failed = parts.fixesFailed + parts.validationsOverturned;
  return { score: Math.round((upheld / (upheld + failed)) * 1000) / 1000, dataPoints };
}

/**
 * One agent's reputation over the window ending at `now`. Everything comes
 * from recorded work:
 * - fixes accepted: the agent's claims released with reason `resolved`;
 * - fixes failed: reasons `undo` (#450 reverts a bad fix) and `closed`;
 * - silence / deadline releases: those same reasons (#438, #593);
 * - median time to deliver: claim → release for resolved fixes;
 * - validations upheld: this agent's verdict that no later verdict of the
 *   same kind contradicted; overturned: a later opposite verdict on the
 *   same issue and kind won the upsert race (IssueValidation rows replace
 *   per (bug, agent, kind), so "overturned" means the workflow moved past
 *   this agent's judgment).
 */
export async function computeAgentReputation(
  agentId: string,
  tenantId: string,
  now = new Date(),
  db: Pick<typeof prisma, "issueClaim" | "issueValidation"> = prisma,
): Promise<AgentReputationSnapshot> {
  const windowStart = new Date(now.getTime() - REPUTATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [claims, validations] = await Promise.all([
    db.issueClaim.findMany({
      where: { agentId, releasedAt: { gte: windowStart }, releaseReason: { not: null } },
      select: { releasedAt: true, claimedAt: true, releaseReason: true },
    }),
    db.issueValidation.findMany({
      where: { agentId, createdAt: { gte: windowStart } },
      select: { bugId: true, kind: true, verdict: true, createdAt: true },
    }),
  ]);

  const reasons = claims.map((claim) => claim.releaseReason ?? "");
  const deliverMs = claims
    .filter((claim) => claim.releaseReason === "resolved" && claim.claimedAt != null)
    .map((claim) => claim.releasedAt!.getTime() - claim.claimedAt!.getTime())
    .filter((duration) => Number.isFinite(duration) && duration >= 0);

  // Later opposite verdicts of the same kind on the same issue overturn the
  // agent's earlier one; anything not contradicted counts as upheld.
  const myKeys = new Map(
    validations.map((validation) => [`${validation.bugId}:${validation.kind}`, validation]),
  );
  const contested = new Set(myKeys.keys());
  const others = await db.issueValidation.findMany({
    where: {
      bugId: { in: validations.map((validation) => validation.bugId) },
      agentId: { not: agentId },
      createdAt: { gte: windowStart },
    },
    select: { bugId: true, kind: true, verdict: true, createdAt: true },
  });
  for (const other of others) {
    const mine = myKeys.get(`${other.bugId}:${other.kind}`);
    if (!mine || other.verdict === mine.verdict || other.createdAt < mine.createdAt) continue;
    contested.delete(`${other.bugId}:${other.kind}`);
  }

  const parts: ReputationParts = {
    fixesAccepted: reasons.filter((reason) => reason === "resolved").length,
    fixesFailed: reasons.filter((reason) => reason === "undo" || reason === "closed").length,
    silenceReleases: reasons.filter((reason) => reason === "silence" || reason === "owner_unresponsive").length,
    deadlineReleases: reasons.filter((reason) => reason === "deadline").length,
    validationsUpheld: [...contested].length,
    validationsOverturned: myKeys.size - contested.size,
    medianDeliverMs: median(deliverMs),
  };
  const { score, dataPoints } = reputationScore(parts);
  return { agentId, tenantId, ...parts, score, dataPoints, windowStart };
}

/** Snapshots every live agent of a tenant (or all tenants), replacing rows. */
export async function snapshotReputations(
  tenantId?: string,
  now = new Date(),
  db: Pick<typeof prisma, "agent" | "agentReputation"> = prisma,
): Promise<{ snapshotted: number }> {
  const agents = await db.agent.findMany({
    where: { revokedAt: null, ...(tenantId ? { tenantId } : {}) },
    select: { id: true, tenantId: true },
  });
  for (const agent of agents) {
    const snapshot = await computeAgentReputation(agent.id, agent.tenantId, now, db as typeof prisma);
    await db.agentReputation.upsert({
      where: { agentId: agent.id },
      update: {
        tenantId: snapshot.tenantId, score: snapshot.score, dataPoints: snapshot.dataPoints,
        fixesAccepted: snapshot.fixesAccepted, fixesFailed: snapshot.fixesFailed,
        validationsUpheld: snapshot.validationsUpheld, validationsOverturned: snapshot.validationsOverturned,
        silenceReleases: snapshot.silenceReleases, deadlineReleases: snapshot.deadlineReleases,
        medianDeliverMs: snapshot.medianDeliverMs, windowStart: snapshot.windowStart,
      },
      create: {
        agentId: agent.id, tenantId: snapshot.tenantId, score: snapshot.score, dataPoints: snapshot.dataPoints,
        fixesAccepted: snapshot.fixesAccepted, fixesFailed: snapshot.fixesFailed,
        validationsUpheld: snapshot.validationsUpheld, validationsOverturned: snapshot.validationsOverturned,
        silenceReleases: snapshot.silenceReleases, deadlineReleases: snapshot.deadlineReleases,
        medianDeliverMs: snapshot.medianDeliverMs, windowStart: snapshot.windowStart,
      },
    });
  }
  return { snapshotted: agents.length };
}

/** Cheap read for the offer picker: the known scores, neutral when absent. */
export async function readAgentReputationScores(
  tenantId: string,
  agentIds: string[],
  db: Pick<typeof prisma, "agentReputation"> = prisma,
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  if (agentIds.length === 0) return scores;
  // A test double without the delegate (an offer in a transaction mock, say)
  // just has no snapshots: everyone stays neutral (#594).
  const delegate = (db as { agentReputation?: { findMany?: (args: unknown) => Promise<Array<{ agentId: string; score: number }>> } })
    .agentReputation;
  if (typeof delegate?.findMany !== "function") return scores;
  const rows = await delegate.findMany({
    where: { tenantId, agentId: { in: agentIds } },
    select: { agentId: true, score: true },
  });
  for (const row of rows) scores.set(row.agentId, row.score);
  return scores;
}

/**
 * One agent's reputation for display (/agents/me, team page): its snapshot
 * when one exists, otherwise the neutral default with an empty breakdown, so
 * a brand-new agent always has something coherent to show (#594).
 */
export async function readAgentReputation(
  agentId: string,
  tenantId: string,
  db: Pick<typeof prisma, "agentReputation"> = prisma,
): Promise<ReputationRow> {
  const row = await db.agentReputation.findUnique({ where: { agentId } });
  if (row && row.tenantId === tenantId) {
    return {
      agentId: row.agentId,
      tenantId: row.tenantId,
      score: row.score,
      dataPoints: row.dataPoints,
      fixesAccepted: row.fixesAccepted,
      fixesFailed: row.fixesFailed,
      validationsUpheld: row.validationsUpheld,
      validationsOverturned: row.validationsOverturned,
      silenceReleases: row.silenceReleases,
      deadlineReleases: row.deadlineReleases,
      medianDeliverMs: row.medianDeliverMs,
    };
  }
  return {
    agentId, tenantId,
    score: NEUTRAL_REPUTATION, dataPoints: 0,
    fixesAccepted: 0, fixesFailed: 0,
    validationsUpheld: 0, validationsOverturned: 0,
    silenceReleases: 0, deadlineReleases: 0,
    medianDeliverMs: null,
  };
}
