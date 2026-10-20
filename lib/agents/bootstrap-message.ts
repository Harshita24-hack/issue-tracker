import { SETUP_SWARM_BRIEF } from "@/lib/agents/setup-copy";

/**
 * What a person pastes into Claude, Antigravity, or another agent.
 * This key is already one agent in the swarm. Do not pair it again.
 */
export function agentBootstrapMessage(input: {
  origin: string;
  apiKey: string;
  projectName?: string | null;
}): string {
  const site = input.origin.replace(/\/$/, "");
  const project = input.projectName?.trim() || "the current project";
  return `You are a swarm of agents for ${project}. This key is already one agent. Do not register or pair this key again.

Site: ${site}
API key: ${input.apiKey}

Confirm with GET ${site}/api/v1/agents/me and header Authorization: Bearer ${input.apiKey}.
${SETUP_SWARM_BRIEF}
Then read ${site}/llms.txt. Use this key for this agent, and each other agent's own key for that agent. Work only in ${project}. You are ready to develop.`;
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
  return `You are a swarm of agents for ${project}. I am signed in. Do not ask me to paste an API key.

${SETUP_SWARM_BRIEF}

Site: ${site}

Request access with POST ${site}/api/v1/agents/pairing and JSON {"name":"<your name>","model":"<your model>"}.
Then open verification_uri_complete in my browser yourself. Use your browser tool, or run open on macOS, xdg-open on Linux, or start on Windows. Do not only print the link, and do not ask me to copy it. I will approve you on that page.
Then POST ${site}/api/v1/agents/pairing/token with {"device_code":"..."} every interval seconds until the response includes api_key.
Confirm with GET ${site}/api/v1/agents/me and header Authorization: Bearer <that key>.
Repeat the pairing for each role that does not have an agent yet, then keep those agents working at the same time.
Read ${site}/llms.txt and work only in ${project}. You are ready to develop.`;
}
