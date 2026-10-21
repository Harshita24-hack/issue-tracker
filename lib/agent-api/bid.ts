import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/lib/agents/require-agent";
import { isTenantAdmin } from "@/lib/agents/membership";
import { IssueApiError } from "@/lib/agent-api/issues";
import { isConfirmed } from "@/lib/agent-api/validation";
import { publish } from "@/lib/agent-api/events";
import { workflowFor } from "@/lib/workflow";
import { isOfferExpired } from "@/lib/agent-api/offer";
import { assertRedesignOpen } from "@/lib/redesigns";
import { notifyClaimOffered } from "@/lib/agent-notifications";
import type { AppRole } from "@/lib/roles";

export const BID_NOTE_MAX = 280;
const id = z.string().trim().min(1).max(191);
export const bidSchema = z.object({
  projectId: id.optional(),
  note: z.string().trim().max(BID_NOTE_MAX).optional(),
}).strict();

type Actor = { id: string; role?: AppRole | null };
type Tx = Prisma.TransactionClient;

function openBidWhere(bugId: string) {
  return { bugId, withdrawnAt: null, awardedAt: null };
}

/** A live offer or an active claim already has this task. An expired offer does not. */
async function competingClaim(tx: Tx, bugId: string) {
  const current = await tx.issueClaim.findFirst({
    where: { bugId, releasedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, offeredAt: true, agentId: true, beneficiaryUserId: true, bug: { select: { tenantId: true, projectId: true } } },
  });
  if (!current) return null;
  // The project's own offer window, not the default (#1044: a chosen bid's offer can last longer).
  const windowMs = current.status === "offered" && current.bug?.projectId
    ? (await workflowFor(current.bug.projectId, tx)).offerWindowSeconds * 1000
    : undefined;
  if (current.status === "offered" && isOfferExpired(current.offeredAt, Date.now(), windowMs)) return { expired: current };
  if (current.status === "offered") throw new IssueApiError(409, "This issue has a pending offer.");
  if (current.status === "active") throw new IssueApiError(409, "This issue is already being worked.");
  return null;
}

/** An agent asks for a task. The issue stays open until a person awards a bid. */
export async function placeBid(caller: AgentContext, projectId: string, bugId: string, note?: string) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Bug" WHERE "id" = ${bugId} AND "tenantId" = ${caller.tenantId} AND "projectId" = ${projectId} AND "isDeleted" = false FOR UPDATE`;
    if (!locked.length) throw new IssueApiError(404, "Issue not found in this project.");
    const bug = await tx.bug.findFirst({
      where: { id: bugId, tenantId: caller.tenantId, projectId, isDeleted: false },
      select: { id: true, projectId: true, status: true },
    });
    if (!bug) throw new IssueApiError(404, "Issue not found in this project.");
    if (bug.status !== "open") throw new IssueApiError(409, "Only open issues can take bids.");
    if (!await isConfirmed(bugId, tx)) throw new IssueApiError(409, "The issue must be confirmed before an agent can bid.");
    await assertRedesignOpen(bugId, tx);
    await competingClaim(tx, bugId);
    const activeClaims = await tx.issueClaim.count({
      where: { beneficiaryUserId: caller.ownerId, status: "active", releasedAt: null, bug: { tenantId: caller.tenantId, projectId } },
    });
    const { maxActiveClaims } = await workflowFor(projectId, tx);
    if (activeClaims >= maxActiveClaims) throw new IssueApiError(409, "This person already has the maximum number of active tasks.");

    const existing = await tx.issueBid.findUnique({ where: { bugId_agentId: { bugId, agentId: caller.agentId } } });
    if (existing?.awardedAt) throw new IssueApiError(409, "This bid was already awarded.");
    if (existing && !existing.withdrawnAt) return existing;

    const bid = existing
      ? await tx.issueBid.update({
          where: { id: existing.id },
          data: { note: note ?? null, withdrawnAt: null, beneficiaryUserId: caller.ownerId },
        })
      : await tx.issueBid.create({
          data: { bugId, agentId: caller.agentId, beneficiaryUserId: caller.ownerId, note: note ?? null },
        });
    await publish(tx, {
      tenantId: caller.tenantId,
      type: "issue.bid",
      actorAgentId: caller.agentId,
      bugId,
      payload: { bidId: bid.id, issueId: bugId, projectId, beneficiaryUserId: caller.ownerId },
    });
    return bid;
  });
}

export async function listBids(caller: AgentContext, projectId: string, bugId: string) {
  const bug = await prisma.bug.findFirst({
    where: { id: bugId, tenantId: caller.tenantId, projectId, isDeleted: false },
    select: { id: true, areaId: true },
  });
  if (!bug) throw new IssueApiError(404, "Issue not found in this project.");
  const bids = await prisma.issueBid.findMany({
    where: openBidWhere(bugId),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      agentId: true,
      beneficiaryUserId: true,
      note: true,
      createdAt: true,
      agent: { select: { name: true, areaPreferences: {
        where: { projectAreaId: bug.areaId ?? "" },
        select: { projectAreaId: true },
      } } },
    },
  });
  return bids
    .map(({ agent, ...bid }) => ({ ...bid, agent, areaMatch: Boolean(bug.areaId && agent.areaPreferences.length) }))
    .sort((a, b) => Number(b.areaMatch) - Number(a.areaMatch) || a.createdAt.getTime() - b.createdAt.getTime());
}

/** The bidding agent takes its own bid back. Awarded bids stay. */
export async function withdrawBid(caller: AgentContext, projectId: string, bugId: string) {
  return prisma.$transaction(async (tx) => {
    const bid = await tx.issueBid.findUnique({
      where: { bugId_agentId: { bugId, agentId: caller.agentId } },
      include: { bug: { select: { tenantId: true, projectId: true, isDeleted: true } } },
    });
    if (!bid || bid.bug.tenantId !== caller.tenantId || bid.bug.projectId !== projectId || bid.bug.isDeleted) {
      throw new IssueApiError(404, "Bid not found.");
    }
    await tx.$queryRaw`SELECT "id" FROM "Bug" WHERE "id" = ${bugId} AND "isDeleted" = false FOR NO KEY UPDATE`;
    const fresh = await tx.issueBid.findUnique({ where: { id: bid.id } });
    if (!fresh) throw new IssueApiError(404, "Bid not found.");
    if (fresh.awardedAt) throw new IssueApiError(409, "This bid was already awarded.");
    if (fresh.withdrawnAt) return fresh;
    const withdrawnAt = new Date();
    const updated = await tx.issueBid.updateMany({
      where: { id: fresh.id, awardedAt: null, withdrawnAt: null },
      data: { withdrawnAt },
    });
    if (updated.count !== 1) throw new IssueApiError(409, "This bid was already awarded.");
    await publish(tx, {
      tenantId: caller.tenantId,
      type: "issue.bid_withdrawn",
      actorAgentId: caller.agentId,
      bugId,
      payload: { bidId: fresh.id, issueId: bugId, projectId },
    });
    return { ...fresh, withdrawnAt };
  });
}

/**
 * A person chooses one bid (#1044). The reporter or a tenant admin may choose.
 * Choosing doesn't hand the work over: it sends the bidding agent an offer for
 * the project's offer window, and the agent accepts it with
 * `POST /api/v1/offers/{id}/accept`, which assigns the issue and starts the
 * delivery deadline. The other bids stay open until then, so if the offer
 * lapses or is declined, the person can choose again.
 */
export async function awardBid(actor: Actor, bidId: string) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const bid = await tx.issueBid.findUnique({
        where: { id: bidId },
        include: { bug: { select: { id: true, tenantId: true, reporterId: true, isDeleted: true } } },
      });
      if (!bid || bid.bug.isDeleted) throw new IssueApiError(404, "Bid not found.");
      const allowed = bid.bug.reporterId === actor.id || await isTenantAdmin(actor, bid.bug.tenantId);
      if (!allowed) throw new IssueApiError(403, "Only the reporter or an organization admin can choose a bid.");
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Bug" WHERE "id" = ${bid.bugId} AND "isDeleted" = false FOR UPDATE`;
      if (!locked.length) throw new IssueApiError(404, "Bid not found.");
      const fresh = await tx.issueBid.findUnique({
        where: { id: bidId },
        include: { bug: { select: { id: true, title: true, status: true, assigneeId: true, tenantId: true, projectId: true } } },
      });
      if (!fresh || fresh.withdrawnAt || fresh.awardedAt) throw new IssueApiError(409, "This bid is no longer open.");
      if (fresh.bug.status !== "open") throw new IssueApiError(409, "Only open issues can be given out.");
      if (fresh.bug.assigneeId && fresh.bug.assigneeId !== fresh.beneficiaryUserId) {
        throw new IssueApiError(409, "This issue is already assigned to someone else.");
      }
      const now = new Date();
      // A live offer (to this or another bidder) or an active claim blocks a
      // second choice; an expired offer is released first.
      const competing = await competingClaim(tx, fresh.bugId);
      if (competing?.expired) {
        await tx.issueClaim.update({
          where: { id: competing.expired.id },
          data: { status: "released", releasedAt: now, releaseReason: "expired" },
        });
        await publish(tx, {
          tenantId: competing.expired.bug.tenantId,
          type: "claim.released",
          actorAgentId: competing.expired.agentId,
          bugId: fresh.bugId,
          payload: { claimId: competing.expired.id, issueId: fresh.bugId, beneficiaryUserId: competing.expired.beneficiaryUserId, reason: "expired" },
        });
      }
      const activeClaims = await tx.issueClaim.count({
        where: { beneficiaryUserId: fresh.beneficiaryUserId, status: "active", releasedAt: null, bug: { tenantId: fresh.bug.tenantId, projectId: fresh.bug.projectId } },
      });
      const workflow = await workflowFor(fresh.bug.projectId, tx);
      if (activeClaims >= workflow.maxActiveClaims) throw new IssueApiError(409, "This person already has the maximum number of active tasks.");

      const claim = await tx.issueClaim.create({
        data: {
          bugId: fresh.bugId,
          beneficiaryUserId: fresh.beneficiaryUserId,
          agentId: fresh.agentId,
          status: "offered",
          offeredAt: now,
        },
      });
      const marked = await tx.issueBid.updateMany({
        where: { id: fresh.id, awardedAt: null, withdrawnAt: null },
        data: { awardedAt: now, claimId: claim.id },
      });
      if (marked.count !== 1) throw new IssueApiError(409, "This bid is no longer open.");
      const expiresAt = new Date(now.getTime() + workflow.offerWindowSeconds * 1000).toISOString();
      await publish(tx, {
        tenantId: fresh.bug.tenantId,
        type: "claim.offered",
        bugId: fresh.bugId,
        payload: { claimId: claim.id, issueId: fresh.bugId, projectId: fresh.bug.projectId, beneficiaryUserId: fresh.beneficiaryUserId, bidId: fresh.id, expiresAt },
      });
      await publish(tx, {
        tenantId: fresh.bug.tenantId,
        type: "issue.bid_awarded",
        actorAgentId: fresh.agentId,
        bugId: fresh.bugId,
        payload: { bidId: fresh.id, claimId: claim.id, issueId: fresh.bugId, projectId: fresh.bug.projectId, beneficiaryUserId: fresh.beneficiaryUserId, offered: true, expiresAt },
      });
      return { bidId: fresh.id, claimId: claim.id, bugId: fresh.bugId, bugTitle: fresh.bug.title, beneficiaryUserId: fresh.beneficiaryUserId, expiresAt };
    });
    notifyClaimOffered({ id: result.claimId, bugId: result.bugId, bugTitle: result.bugTitle, beneficiaryUserId: result.beneficiaryUserId });
    return { bidId: result.bidId, claimId: result.claimId, bugId: result.bugId, expiresAt: result.expiresAt };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new IssueApiError(409, "This issue already has an active claim or pending offer.");
    }
    throw error;
  }
}

/**
 * The offer waiting on an agent's answer, if any (#1044): the issue page shows
 * it under the bids, and holds the Choose buttons until it is answered or lapses.
 */
export async function liveOfferFor(bugId: string, projectId: string, now = new Date()) {
  const windowMs = (await workflowFor(projectId)).offerWindowSeconds * 1000;
  const row = await prisma.issueClaim.findFirst({
    where: { bugId, status: "offered", releasedAt: null, offeredAt: { gt: new Date(now.getTime() - windowMs) } },
    orderBy: { offeredAt: "desc" },
    select: { offeredAt: true, agent: { select: { name: true } }, beneficiary: { select: { name: true } } },
  });
  if (!row?.offeredAt) return null;
  return {
    agentName: row.agent.name,
    personName: row.beneficiary.name ?? "a member",
    expiresAt: new Date(row.offeredAt.getTime() + windowMs).toISOString(),
  };
}
