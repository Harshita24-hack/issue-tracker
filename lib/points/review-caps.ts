import type { Prisma, PrismaClient, Severity } from "@prisma/client";
import { award, type PointAward } from "@/lib/points/award";
import {
  calculateReviewerPoints,
  calculateSolverPoints,
  type ProjectRewardConfig,
} from "@/lib/points/project-rewards";
import {
  CONFIRMATION_REVIEWER_POINTS,
  MAX_REWARDED_REVIEWERS,
  confirmationReviewerSourceKey,
  pointSourceKey,
} from "@/lib/points/rules";

/**
 * #1046: reviews are open to everyone, but a project sets how many reviewers
 * an issue pays and how many review points it pays out in a day, so a flood
 * of issues and reviews can't run up an unbounded points bill. Reviews past
 * either limit still count (towards confirmation and the merge gate); they
 * just pay nothing.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type ReviewStage = "confirm" | "fix";

/** How many reviewers each review stage pays on one issue. */
export function paidReviewersCap(
  stage: ReviewStage,
  config: ProjectRewardConfig | null | undefined,
  workflow: { confirmationsNeeded: number },
): number {
  if (config?.paidReviewsPerIssue) return config.paidReviewsPerIssue;
  // Unset: today's behaviour. The confirming reviewers, and two fix reviewers.
  return stage === "confirm" ? workflow.confirmationsNeeded : MAX_REWARDED_REVIEWERS;
}

/** Points one review pays at each stage. */
export function reviewPoints(stage: ReviewStage, config: ProjectRewardConfig | null | undefined): number {
  return stage === "confirm" ? CONFIRMATION_REVIEWER_POINTS : calculateReviewerPoints(config);
}

function reviewSourceKey(stage: ReviewStage, bugId: string, userId: string): string {
  return stage === "confirm" ? confirmationReviewerSourceKey(bugId, userId) : pointSourceKey("reviewer", bugId, userId);
}

function reviewKeyPrefix(stage: ReviewStage, bugId: string): string {
  return stage === "confirm" ? `reviewer-confirm:${bugId}:` : `reviewer:${bugId}:`;
}

/** Midnight UTC of `now`: the daily budget resets then. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Review points the project has left today, or null when it has no daily budget. */
export async function dailyReviewBudgetLeft(
  db: Db,
  projectId: string,
  config: ProjectRewardConfig | null | undefined,
  now = new Date(),
): Promise<number | null> {
  const budget = config?.dailyReviewBudget;
  if (budget === null || budget === undefined) return null;
  const spent = await db.pointEntry.aggregate({
    where: { role: "reviewer", correctedAt: null, createdAt: { gte: startOfUtcDay(now) }, bug: { projectId } },
    _sum: { points: true },
  });
  return Math.max(0, budget - (spent._sum.points ?? 0));
}

export type ReviewPayout = { userId: string; paid: boolean; reason?: "issue_cap" | "daily_budget" };

/**
 * Pays `reviewerUserIds` (in the order their reviews counted) for one stage,
 * up to the issue's cap and the day's budget. Already-paid reviewers count
 * towards the cap and are never paid twice (the sourceKey is unique).
 */
export async function payReviewers(
  db: Db,
  input: {
    stage: ReviewStage;
    tenantId: string;
    projectId: string;
    bugId: string;
    reviewerUserIds: readonly string[];
    config: ProjectRewardConfig | null | undefined;
    workflow: { confirmationsNeeded: number };
    now?: Date;
    /** Award only this reviewer; the others are only counted (a later review). */
    only?: string;
  },
): Promise<ReviewPayout[]> {
  const cap = paidReviewersCap(input.stage, input.config, input.workflow);
  const points = reviewPoints(input.stage, input.config);
  let budgetLeft = await dailyReviewBudgetLeft(db, input.projectId, input.config, input.now);
  const payouts: ReviewPayout[] = [];
  for (const [index, userId] of input.reviewerUserIds.entries()) {
    if (input.only && userId !== input.only) continue;
    if (index >= cap) {
      payouts.push({ userId, paid: false, reason: "issue_cap" });
      continue;
    }
    if (budgetLeft !== null && budgetLeft < points) {
      payouts.push({ userId, paid: false, reason: "daily_budget" });
      continue;
    }
    const entry: PointAward = {
      tenantId: input.tenantId,
      userId,
      bugId: input.bugId,
      role: "reviewer",
      points,
      sourceKey: reviewSourceKey(input.stage, input.bugId, userId),
    };
    const written = await award(db, entry);
    if (written && budgetLeft !== null) budgetLeft -= points;
    payouts.push({ userId, paid: true });
  }
  return payouts;
}

export type IssueRewards = {
  review: { points: number; paid: number; cap: number; remaining: number };
  fixReview: { points: number; paid: number; cap: number; remaining: number };
  solve: { points: number };
  /** Review points the project can still pay today; null when it has no daily budget. */
  dailyReviewBudgetLeft: number | null;
};

/**
 * What each issue can still pay (#1046), so an agent can tell from the issue
 * alone whether a review is worth doing. One query per stage for the whole
 * batch.
 */
export async function rewardsForIssues(
  db: Db,
  input: {
    projectId: string;
    issues: readonly { id: string; severity: Severity }[];
    config: ProjectRewardConfig | null | undefined;
    workflow: { confirmationsNeeded: number };
    now?: Date;
  },
): Promise<Map<string, IssueRewards>> {
  const ids = input.issues.map((issue) => issue.id);
  const paidBy = async (stage: ReviewStage) => {
    const rows = ids.length
      ? await db.pointEntry.findMany({
          where: {
            bugId: { in: ids },
            role: "reviewer",
            correctedAt: null,
            OR: ids.map((id) => ({ sourceKey: { startsWith: reviewKeyPrefix(stage, id) } })),
          },
          select: { bugId: true },
        })
      : [];
    const counts = new Map<string, number>();
    for (const row of rows) if (row.bugId) counts.set(row.bugId, (counts.get(row.bugId) ?? 0) + 1);
    return counts;
  };
  const [confirmPaid, fixPaid, budgetLeft] = await Promise.all([
    paidBy("confirm"),
    paidBy("fix"),
    dailyReviewBudgetLeft(db, input.projectId, input.config, input.now),
  ]);
  const stage = (kind: ReviewStage, paid: number) => {
    const cap = paidReviewersCap(kind, input.config, input.workflow);
    return { points: reviewPoints(kind, input.config), paid, cap, remaining: Math.max(0, cap - paid) };
  };
  return new Map(
    input.issues.map((issue) => [
      issue.id,
      {
        review: stage("confirm", confirmPaid.get(issue.id) ?? 0),
        fixReview: stage("fix", fixPaid.get(issue.id) ?? 0),
        solve: { points: calculateSolverPoints(issue.severity, input.config ?? null) },
        dailyReviewBudgetLeft: budgetLeft,
      },
    ]),
  );
}
