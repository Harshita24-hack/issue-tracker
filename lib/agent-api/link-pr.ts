import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/lib/agents/require-agent";
import { createReviewOffers } from "@/lib/agent-api/review-offer";
import { publish } from "@/lib/agent-api/events";
import {
  clientForInstallation,
  mergeAcceptedFix,
  parseGitHubRepoUrl,
  parsePullRequestUrl,
  sameRepo,
  standingAcceptance,
} from "@/lib/github/merge-pr";

export type LinkPullRequestResult = { status: number; body: Record<string, unknown> };

function respond(body: Record<string, unknown>, init?: { status?: number }): LinkPullRequestResult {
  return { status: init?.status ?? 200, body };
}

/**
 * #1045: is `pullRequestUrl` a GitHub pull request on this repository? A
 * delivery comment checks this before anything is written.
 */
export function checkPullRequestUrl(pullRequestUrl: string, repositoryUrl: string | null | undefined): string | null {
  const ref = parsePullRequestUrl(pullRequestUrl);
  if (!ref) return "That is not a GitHub pull request URL.";
  const repo = parseGitHubRepoUrl(repositoryUrl);
  if (repo && !sameRepo(ref, repo)) return "That pull request is not in this issue's repository.";
  return null;
}

/**
 * Link the pull request that fixes an issue (#452), shared by
 * `POST /issues/{id}/github` and a `delivery` comment with a `pullRequestUrl`
 * (#1045). The calling agent must hold the active claim. When the fix has
 * already been accepted (#434), it also tries the merge.
 */
export async function linkPullRequest(agent: AgentContext, bugId: string, pullRequestUrl: string): Promise<LinkPullRequestResult> {
  const ref = parsePullRequestUrl(pullRequestUrl);
  if (!ref) {
    return respond({ error: "That is not a GitHub pull request URL." }, { status: 400 });
  }

  const bug = await prisma.bug.findFirst({
    where: { id: bugId, tenantId: agent.tenantId, isDeleted: false },
    select: {
      id: true,
      projectId: true,
      pullRequestUrl: true,
      repositoryUrl: true,
      project: { select: { repoUrl: true, githubInstallationId: true } },
    },
  });
  if (!bug) return respond({ error: "No such issue." }, { status: 404 });

  const claim = await prisma.issueClaim.findFirst({
    where: { bugId: bug.id, agentId: agent.agentId, status: "active", releasedAt: null },
    select: { id: true },
  });
  if (!claim) {
    return respond(
      { error: "Accept an offer or have your bid awarded before linking a fix." },
      { status: 409 },
    );
  }

  // #1047: the issue's own repository, else the project's.
  const repo = parseGitHubRepoUrl(bug.repositoryUrl ?? bug.project?.repoUrl);
  if (repo && !sameRepo(ref, repo)) {
    return respond(
      { error: "That pull request is not in this issue's repository." },
      { status: 422 },
    );
  }

  // #489: once a fix is accepted, its pull request is part of what was
  // reviewed. Swapping in a different one would merge code nobody accepted,
  // so the link itself is refused.
  const accepted = await standingAcceptance(prisma, bug.id);
  if (accepted && bug.pullRequestUrl && bug.pullRequestUrl !== pullRequestUrl) {
    return respond(
      {
        error:
          "This issue's accepted fix is bound to a different pull request — link the accepted one again.",
      },
      { status: 409 },
    );
  }

  // #489: record the head commit with the link, so the acceptance and the
  // merge gate bind to the exact code, not just a pull request number.
  let pullRequestHeadSha: string | null = null;
  const client = clientForInstallation(bug.project?.githubInstallationId);
  if (client) {
    pullRequestHeadSha = await client
      .getPullRequest(ref)
      .then((pullRequest) => pullRequest.headSha || null)
      .catch(() => null);
  }

  await prisma.$transaction(async (tx) => {
    await tx.bug.update({
      where: { id: bug.id },
      data: { pullRequestUrl: pullRequestUrl, pullRequestHeadSha },
    });

    await tx.bugActivity.create({
      data: {
        bugId: bug.id,
        actorId: agent.ownerId,
        type: "edited",
        summary: `linked PR ${pullRequestUrl}`,
        metadata: {
          field: "pullRequestUrl",
          pullRequestUrl: pullRequestUrl,
        },
      },
    });

    await publish(tx, {
      tenantId: agent.tenantId,
      type: "issue.pr_linked",
      payload: {
        issueId: bug.id,
        projectId: bug.projectId,
        pullRequestUrl: pullRequestUrl,
        agentId: agent.agentId,
      },
      actorAgentId: agent.agentId,
      bugId: bug.id,
    });
  });

  await createReviewOffers(prisma, agent, bug.id, {
    pullRequestUrl: pullRequestUrl,
  }).catch(() => null);

  const result = await mergeAcceptedFix(agent, bugId);
  if (result.status === 200) {
    return respond({ linked: true, merged: true, mergeCommitSha: result.mergeCommitSha });
  }
  // The link is saved; the merge is simply not due yet.
  if (result.reason === "not_accepted") {
    return respond({ linked: true, merged: false, reason: result.reason });
  }
  if (result.reason === "waiting_for_human") {
    return respond(
      { error: "waiting_for_human", approvalId: result.approvalId, linked: true, merged: false },
      { status: 409 },
    );
  }
  return respond(
    { linked: true, merged: false, reason: result.reason, message: result.message },
    { status: result.status },
  );
}
