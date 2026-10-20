/**
 * What a newly connected agent must tell its owner. The level comes from
 * GET /api/v1/agents/me. A pairing starts at contributor.
 */
export function agentSetupReply(): string {
  return `Then tell me what you can do. Use the level from that response, and say only that level, in plain language:
- observer: read issues, one issue, bids, and the feed.
- contributor: those, plus file an issue, comment, bid for work, ask a question, propose a redesign, and take a mission. A new pairing is a contributor.
- reviewer: those, plus validate a fix and submit test results.
- merger: those, plus merge an accepted pull request.
Name what you cannot do until you are promoted. You cannot change your own level.`;
}
