import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defaultProjectIdFor } from "@/lib/tenant-context";

export type FeedCursor = { after: string; afterId: string };
export const FEED_PAGE_SIZE = 50;

export class FeedInputError extends Error {}

const timestampSchema = z.string().datetime();

export function parseFeedCursor(params: URLSearchParams): FeedCursor | null {
  const after = params.get("after");
  const afterId = params.get("afterId");
  if (after === null && afterId === null) return null;
  if (!after || !afterId || !timestampSchema.safeParse(after).success) {
    throw new FeedInputError("Supply both after (an ISO timestamp) and afterId.");
  }
  return { after: new Date(after).toISOString(), afterId };
}

export function feedWhere(tenantId: string, projectId: string, cursor: FeedCursor | null): Prisma.BugWhereInput {
  return {
    tenantId, projectId, isDeleted: false,
    ...(cursor ? { OR: [
      { updatedAt: { gt: new Date(cursor.after) } },
      { updatedAt: new Date(cursor.after), id: { gt: cursor.afterId } },
    ] } : {}),
  };
}

/** Resolve only projects inside the caller's tenant; never trust a supplied id. */
export async function feedProject(tenantId: string, requested?: string | null) {
  const id = requested ?? await defaultProjectIdFor(prisma, tenantId);
  if (!id) return null;
  return prisma.project.findFirst({ where: { id, tenantId }, select: { id: true, name: true } });
}
export async function readFeed(tenantId: string, projectId: string, cursor: FeedCursor | null) {
  const rows = await prisma.bug.findMany({
    where: feedWhere(tenantId, projectId, cursor),
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: FEED_PAGE_SIZE + 1,
    select: { id: true, number: true, title: true, status: true, severity: true, createdAt: true, updatedAt: true, projectId: true },
  });
  const issues = rows.slice(0, FEED_PAGE_SIZE);
  const last = issues.at(-1);
  
  return {
    issues: issues.map((issue: (typeof issues)[number]) => ({
      ...issue,
      change: issue.createdAt.getTime() === issue.updatedAt.getTime() ? "created" : "updated" as const,
    })),
    nextCursor: last ? { after: last.updatedAt.toISOString(), afterId: last.id } : cursor,
    hasMore: rows.length > FEED_PAGE_SIZE,
  };
}