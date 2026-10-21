import { describe, expect, it, vi } from "vitest";
import { parseProjectRewardConfig } from "./project-rewards";
import {
  dailyReviewBudgetLeft,
  paidReviewersCap,
  payReviewers,
  rewardsForIssues,
  startOfUtcDay,
} from "./review-caps";

/** #1046: reviews stay open to everyone; the project caps what they pay. */

const workflow = { confirmationsNeeded: 2 };
const NOW = new Date("2026-10-21T15:00:00Z");

/** A point ledger in memory: createMany skips an existing sourceKey, like the real one. */
function ledger(existing: { sourceKey: string; points: number; bugId: string; createdAt?: Date }[] = []) {
  const rows = existing.map((row) => ({ role: "reviewer", correctedAt: null, createdAt: NOW, ...row }));
  return {
    rows,
    db: {
      pointEntry: {
        createMany: vi.fn(async ({ data }: { data: { sourceKey: string; points: number; bugId: string }[] }) => {
          let count = 0;
          for (const entry of data) {
            if (rows.some((row) => row.sourceKey === entry.sourceKey)) continue;
            rows.push({ role: "reviewer", correctedAt: null, createdAt: NOW, ...entry });
            count++;
          }
          return { count };
        }),
        aggregate: vi.fn(async ({ where }: { where: { createdAt: { gte: Date } } }) => ({
          _sum: { points: rows.filter((row) => row.createdAt >= where.createdAt.gte).reduce((sum, row) => sum + row.points, 0) },
        })),
        findMany: vi.fn(async ({ where }: { where: { OR: { sourceKey: { startsWith: string } }[] } }) =>
          rows.filter((row) => where.OR.some((clause) => row.sourceKey.startsWith(clause.sourceKey.startsWith))),
        ),
      },
    } as never,
  };
}

const base = { tenantId: "t", projectId: "p", bugId: "bug-1", workflow, now: NOW };

describe("paidReviewersCap", () => {
  it("keeps today's numbers when the project sets nothing", () => {
    const config = parseProjectRewardConfig({});
    expect(paidReviewersCap("confirm", config, { confirmationsNeeded: 3 })).toBe(3);
    expect(paidReviewersCap("fix", config, workflow)).toBe(2);
  });

  it("uses the project's paid reviews per issue for both stages", () => {
    const config = parseProjectRewardConfig({ paidReviewsPerIssue: 4 });
    expect(paidReviewersCap("confirm", config, workflow)).toBe(4);
    expect(paidReviewersCap("fix", config, workflow)).toBe(4);
  });
});

describe("payReviewers", () => {
  it("pays reviewers in order up to the cap, and later ones nothing", async () => {
    const { db, rows } = ledger();
    const config = parseProjectRewardConfig({ paidReviewsPerIssue: 4 });
    const payouts = await payReviewers(db, { ...base, stage: "confirm", config, reviewerUserIds: ["a", "b", "c", "d", "e"] });
    expect(payouts).toEqual([
      { userId: "a", paid: true },
      { userId: "b", paid: true },
      { userId: "c", paid: true },
      { userId: "d", paid: true },
      { userId: "e", paid: false, reason: "issue_cap" },
    ]);
    expect(rows.map((row) => row.sourceKey)).toEqual([
      "reviewer-confirm:bug-1:a",
      "reviewer-confirm:bug-1:b",
      "reviewer-confirm:bug-1:c",
      "reviewer-confirm:bug-1:d",
    ]);
  });

  it("pays a later reviewer on their own, if the cap still allows", async () => {
    const { db, rows } = ledger([
      { sourceKey: "reviewer-confirm:bug-1:a", points: 5, bugId: "bug-1" },
      { sourceKey: "reviewer-confirm:bug-1:b", points: 5, bugId: "bug-1" },
    ]);
    const config = parseProjectRewardConfig({ paidReviewsPerIssue: 3 });
    expect(await payReviewers(db, { ...base, stage: "confirm", config, reviewerUserIds: ["a", "b", "c"], only: "c" }))
      .toEqual([{ userId: "c", paid: true }]);
    expect(await payReviewers(db, { ...base, stage: "confirm", config, reviewerUserIds: ["a", "b", "c", "d"], only: "d" }))
      .toEqual([{ userId: "d", paid: false, reason: "issue_cap" }]);
    expect(rows).toHaveLength(3);
  });

  it("stops paying once the day's review budget is spent, and pays again the next day", async () => {
    const { db } = ledger([{ sourceKey: "reviewer-confirm:other:x", points: 8, bugId: "other" }]);
    const config = parseProjectRewardConfig({ paidReviewsPerIssue: 5, dailyReviewBudget: 10 });
    // 2 left today; a confirmation review is worth 5.
    expect(await payReviewers(db, { ...base, stage: "confirm", config, reviewerUserIds: ["a"] }))
      .toEqual([{ userId: "a", paid: false, reason: "daily_budget" }]);
    const tomorrow = new Date("2026-10-22T09:00:00Z");
    expect(await payReviewers(db, { ...base, now: tomorrow, stage: "confirm", config, reviewerUserIds: ["a"] }))
      .toEqual([{ userId: "a", paid: true }]);
  });

  it("never pays the same reviewer twice", async () => {
    const { db, rows } = ledger([{ sourceKey: "reviewer:bug-1:a", points: 10, bugId: "bug-1" }]);
    const config = parseProjectRewardConfig({});
    await payReviewers(db, { ...base, stage: "fix", config, reviewerUserIds: ["a", "b"] });
    expect(rows.map((row) => row.sourceKey)).toEqual(["reviewer:bug-1:a", "reviewer:bug-1:b"]);
  });
});

describe("dailyReviewBudgetLeft", () => {
  it("is null without a budget, and counts today's review points from midnight UTC", async () => {
    const { db } = ledger([
      { sourceKey: "reviewer:x:1", points: 4, bugId: "x", createdAt: new Date("2026-10-21T00:30:00Z") },
      { sourceKey: "reviewer:x:2", points: 50, bugId: "x", createdAt: new Date("2026-10-20T23:59:00Z") },
    ]);
    expect(await dailyReviewBudgetLeft(db, "p", parseProjectRewardConfig({}), NOW)).toBeNull();
    expect(await dailyReviewBudgetLeft(db, "p", parseProjectRewardConfig({ dailyReviewBudget: 10 }), NOW)).toBe(6);
    expect(startOfUtcDay(NOW).toISOString()).toBe("2026-10-21T00:00:00.000Z");
  });
});

describe("rewardsForIssues", () => {
  it("tells an agent, per issue, how many paid reviews are left and what each pays", async () => {
    const { db } = ledger([{ sourceKey: "reviewer-confirm:bug-1:a", points: 5, bugId: "bug-1" }]);
    const config = parseProjectRewardConfig({ paidReviewsPerIssue: 4, dailyReviewBudget: 20 });
    const rewards = await rewardsForIssues(db, {
      projectId: "p",
      issues: [{ id: "bug-1", severity: "high" }, { id: "bug-2", severity: "low" }],
      config,
      workflow,
      now: NOW,
    });
    expect(rewards.get("bug-1")).toEqual({
      review: { points: 5, paid: 1, cap: 4, remaining: 3 },
      fixReview: { points: 10, paid: 0, cap: 4, remaining: 4 },
      solve: { points: 40 },
      dailyReviewBudgetLeft: 15,
    });
    expect(rewards.get("bug-2")?.review.remaining).toBe(4);
  });
});
