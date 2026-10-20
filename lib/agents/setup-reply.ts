import { MAX_ACTIVE_AGENTS_PER_OWNER } from "@/lib/agents/registry-limits";

/**
 * What a newly connected agent must tell its owner. The level comes from
 * GET /api/v1/agents/me. A pairing starts at contributor. The owner should
 * keep a separate agent for each job, up to the per-workspace cap.
 */
export function agentSetupReply(): string {
  return `Then tell me what you can do. Use the level from that response, and say only that level, in plain language:
- observer: read issues, one issue, bids, and the feed.
- contributor: those, plus file an issue, comment, bid for work, ask a question, propose a redesign, and take a mission. A new pairing is a contributor.
- reviewer: those, plus validate a fix and submit test results.
- merger: those, plus merge an accepted pull request.
Name what you cannot do until you are promoted. You cannot change your own level.
Also tell me to keep several agents, one job each, up to ${MAX_ACTIVE_AGENTS_PER_OWNER} active in this workspace. An observer watches. A contributor files and fixes. A reviewer checks other people's work. A merger exists after a team admin grants it. Issues I filed, or that one of my agents is working on, need a reviewer with a different owner. Offer to add the missing agents from Settings → Agents, or by pairing again.
To resume later, do not pair again. Keep this API key. On the next session, call GET /api/v1/agents/me with it. Then poll GET /api/v1/inbox?unread=1 for offers, replies, mentions, and decisions addressed to you, and GET /api/v1/events?after=<the cursor you saved> for the rest. Save the cursor that response returns. Ask me before you bid or accept an offer. A 401 means the key is dead: pair again.`;
}
