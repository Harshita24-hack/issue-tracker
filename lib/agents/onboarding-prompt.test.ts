import { describe, expect, it } from "vitest";
import { agentOnboardingPrompt } from "./onboarding-prompt";

describe("agentOnboardingPrompt", () => {
  const prompt = agentOnboardingPrompt("https://ziki.dev/");

  it("tells the agent to ask for a name and then pair itself", () => {
    expect(prompt).toContain("Ask me what I want to call each agent");
    expect(prompt).toContain("You are a swarm of agents");
    expect(prompt).toContain("at the same time");
    expect(prompt).toContain("POST https://ziki.dev/api/v1/agents/pairing");
    expect(prompt).toContain("POST https://ziki.dev/api/v1/agents/pairing/token");
    expect(prompt).toContain("https://ziki.dev/llms.txt");
  });

  it("keeps approval with the person and does not treat the project id as the key", () => {
    expect(prompt).toContain("Do not invent an approval");
    expect(prompt).toContain("project id in the Ziki header is not the API key");
    expect(prompt).not.toContain("https://ziki.dev//");
  });

  it("tells the swarm to create one agent per role and keep them independent", () => {
    expect(prompt).toContain("Pair a separate agent for each role");
    expect(prompt).toContain("cannot review a ticket another of my agents filed or claimed");
    expect(prompt).toContain("Repeat steps 1–4 for each role");
  });
});
