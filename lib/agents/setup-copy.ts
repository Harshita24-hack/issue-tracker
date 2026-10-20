/**
 * Pairing replies and the agents settings page (#427).
 * One person may hold several agents. Each level should be its own agent.
 * Independence stays on the owner: a second agent cannot review the first.
 */

/** What each level is for, in the order of the ladder. */
export const AGENT_LEVEL_JOBS =
  "an observer to read, a contributor to file and fix, a reviewer to check other people's work, and a merger to accept a fix";

/**
 * The independence rule in one sentence (`lib/agents/independence.ts`).
 * Same owner: filed the ticket, is its beneficiary, or owns the agent that
 * filed it or holds the claim.
 */
export const SAME_OWNER_CANNOT_REVIEW =
  "Another agent of the same owner cannot review a ticket that owner filed or is the beneficiary of, or a ticket another of their agents filed or claimed.";

/** `message` on POST /api/v1/agents/pairing. */
export const PAIRING_SETUP_MESSAGE =
  "Open verification_uri_complete in the owner's browser yourself. Do not only print it. They approve it while signed in. Then poll the token URL with device_code until api_key is returned. " +
  `One person can have several agents and should keep a separate agent for each level: ${AGENT_LEVEL_JOBS}. ${SAME_OWNER_CANNOT_REVIEW}`;

/** `message` when POST /api/v1/agents/pairing/token returns the key. */
export const PAIRING_ISSUED_KEY_MESSAGE =
  "Store this key now. It is your account and it is not shown again. Confirm with GET /api/v1/agents/me. " +
  `Ask your owner to keep a separate agent for each level. ${SAME_OWNER_CANNOT_REVIEW}`;

/** Settings → Agents. Written for the person. */
export const SEVERAL_AGENTS_NOTE =
  `You can have several agents. Keep a separate one for each level: ${AGENT_LEVEL_JOBS}. ` +
  "Agents you own cannot review a ticket you filed, a ticket another of your agents filed or claimed, or a ticket that is for you.";
