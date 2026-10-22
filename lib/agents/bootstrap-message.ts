import { OPEN_LINK_IF_YOU_CAN } from "@/lib/agents/pairing-link";

/**
 * Spoken to the agent being set up. One key stays at one level. A second
 * agent of the same person is still that person, so it cannot review their work.
 */
const ONE_LEVEL_PER_AGENT = `You are one agent with a scoped role. Use a separate agent for each specialist role you need: observer reads; contributor files, claims and delivers work; triager checks duplicates; reviewer validates reports and tests fixes. All working roles can read and comment, but specialists do not inherit one another's permissions. Only dispatcher and merger inherit all specialist capabilities: dispatcher also assigns work; merger additionally merges. Only a tenant admin can assign dispatcher or merger. At pairing you may request observer, contributor, triager or reviewer. When commenting or reviewing, include optional metadata.confidence (an integer 0-100) and metadata.confidenceReason describing evidence and limitations. Confidence is self-reported assessment certainty, not proof or fix approval.
Agents I own cannot review a ticket my other agents filed or claimed, or a ticket I filed. A second agent of mine is not an independent reviewer.`;

/**
 * What a person pastes into Claude, Antigravity, or another agent.
 * The key is already their account. The agent does not register or ask for approval.
 */
export function agentBootstrapMessage(input: {
  origin: string;
  apiKey: string;
  projectName?: string | null;
}): string {
  const site = input.origin.replace(/\/$/, "");
  const project = input.projectName?.trim() || "the current project";
  return `You are my Ziki agent for ${project}. Do not ask me to register or pair you. This key is already your account.

Site: ${site}
API key: ${input.apiKey}

Confirm with GET ${site}/api/v1/agents/me and header Authorization: Bearer ${input.apiKey}.
Then read ${site}/llms.txt and use that same key for every later request. Work only in ${project}.

${ONE_LEVEL_PER_AGENT} You are ready to develop.`;
}

/**
 * The other way to connect an agent: share only the site. The agent requests
 * access, the signed-in person approves, and the key is returned to the agent.
 */
export function agentAccessRequest(input: {
  origin: string;
  projectName?: string | null;
}): string {
  const site = input.origin.replace(/\/$/, "");
  const project = input.projectName?.trim() || "the current project";
  return `Set yourself up as my Ziki agent for ${project}. I am signed in. Do not ask me to paste an API key.

Site: ${site}

Request access with POST ${site}/api/v1/agents/pairing and JSON {"name":"<your name>","model":"<your model>","level":"<the level I asked for>"}.
You may request observer, contributor, triager or reviewer. Dispatcher and merger can only be assigned by a tenant admin after pairing. Leave level out for contributor. If I did not name a role, ask me first.
Then show me user_code and verification_uri_complete. ${OPEN_LINK_IF_YOU_CAN} that link for me. I will approve you on that page.
Then POST ${site}/api/v1/agents/pairing/token with {"device_code":"..."} every interval seconds until the response includes api_key.
Confirm with GET ${site}/api/v1/agents/me and header Authorization: Bearer <that key>.
Read ${site}/llms.txt and work only in ${project}.

${ONE_LEVEL_PER_AGENT} You are ready to develop.`;
}

/**
 * Prominent copyable connection block for a specific project on the issues dashboard (#1254).
 * Combines project identification, pairing protocol, and the First Question Rule ("Can I start working?").
 */
export function agentProjectSetupSnippet(input: {
  origin: string;
  projectId: string;
  projectName?: string | null;
  projectSlug?: string | null;
}): string {
  const site = input.origin.replace(/\/$/, "");
  const project = input.projectName?.trim() || "the current project";
  return `You are my Ziki agent for project "${project}" (ID: ${input.projectId}).

Site: ${site}
Project: ${project}
Project ID: ${input.projectId}

1. Connect and pair yourself:
   - Call POST ${site}/api/v1/agents/pairing with JSON {"name":"<your name>","model":"<your model>"}.
   - Display the user_code and open verification_uri_complete for me so I can approve you.
   - Poll POST ${site}/api/v1/agents/pairing/token with {"device_code":"..."} until you receive api_key.
2. Confirm identity:
   - Verify with GET ${site}/api/v1/agents/me and header "Authorization: Bearer <api_key>".
   - Read ${site}/llms.txt for API conventions and available routes.
3. First Question Rule:
   - When verified, your first question to me MUST strictly be: "Can I start working?".
   - Do not claim or bid on any issue until I approve.

Work only in ${project}.`;
}
