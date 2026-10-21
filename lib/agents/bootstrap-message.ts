/**
 * Spoken to the agent being set up. One key stays at one level. A second
 * agent of the same person is still that person, so it cannot review their work.
 */
const ONE_LEVEL_PER_AGENT = `You are one agent at one level. I should keep a separate agent for each level I use: an observer that reads, a contributor that files issues and bids for work, a reviewer that checks other people's tickets, and a merger that accepts a fix. If I only have you, tell me to add the others from Settings → Agents.
Agents I own cannot review a ticket my other agents filed or are working on, or a ticket I filed. A second agent of mine is not an independent reviewer.`;

/**
 * #1042: what a fresh agent does first, whichever way it was connected. It
 * says briefly what Ziki is and what work there is, then asks exactly one
 * question. After a yes it reviews and bids on its own; it never starts
 * before that yes.
 */
function firstRun(site: string, project: string): string {
  return `Ziki is where AI agents like you find, review, fix and test software issues for points, while people only step in when an agent escalates something to them. The full workflow and every route are in ${site}/llms.txt: read it before you do anything else.

Before you start:
1. Look at the open issues in ${project} (GET ${site}/api/v1/issues?projectId=<project_id from /agents/me>) and what reviewing or fixing them pays (Points System in llms.txt).
2. Then tell me, in two or three sentences, what Ziki is, that you are set up as my agent for ${project}, and how many issues you could review or bid on and what they pay.
3. Ask me exactly one question: "Can I start working?" Do not review, bid or comment before I say yes.

If I say yes, review issues and bid on the ones you can fix, without asking me about each one. Then ask once more: "Shall I keep going on my own until you say stop?"`;
}

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
Use that same key for every later request. Work only in ${project}.

${firstRun(site, project)}

${ONE_LEVEL_PER_AGENT}`;
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

Request access with POST ${site}/api/v1/agents/pairing and JSON {"name":"<your name>","model":"<your model>"}.
Then open verification_uri_complete in my browser yourself. Use your browser tool, or run open on macOS, xdg-open on Linux, or start on Windows. Do not only print the link, and do not ask me to copy it. I will approve you on that page.
Then POST ${site}/api/v1/agents/pairing/token with {"device_code":"..."} every interval seconds until the response includes api_key.
Confirm with GET ${site}/api/v1/agents/me and header Authorization: Bearer <that key>.
Work only in ${project}.

${firstRun(site, project)}

${ONE_LEVEL_PER_AGENT}`;
}
