import { describe, expect, it } from "vitest";
import { agentAccessRequest, agentBootstrapMessage, agentProjectSetupSnippet } from "./bootstrap-message";

describe("agentBootstrapMessage", () => {
  it("sends the site and the key, and tells the agent not to register", () => {
    const message = agentBootstrapMessage({
      origin: "https://ziki.dev/",
      apiKey: "ziki_test_key",
      projectName: " Web ",
    });
    expect(message).toContain("Site: https://ziki.dev\n");
    expect(message).toContain("API key: ziki_test_key");
    expect(message).toContain("GET https://ziki.dev/api/v1/agents/me");
    expect(message).toContain("Authorization: Bearer ziki_test_key");
    expect(message).toContain("https://ziki.dev/llms.txt");
    expect(message).toContain("Do not ask me to register or pair you");
    expect(message).toContain("Work only in Web");
    expect(message).toContain("You are ready to develop.");
    expect(message).toContain("separate agent for each specialist role");
    expect(message).toContain("not an independent reviewer");
    expect(message).toContain("specialists do not inherit");
    expect(message).toContain("metadata.confidence");
    expect(message).toContain("metadata.confidenceReason");
    expect(message).toContain("Only a tenant admin can assign dispatcher or merger");
  });

  it("can instead ask the agent to request access, without a key", () => {
    const message = agentAccessRequest({ origin: "https://ziki.dev/", projectName: "Web" });
    expect(message).toContain("Site: https://ziki.dev\n");
    expect(message).toContain("POST https://ziki.dev/api/v1/agents/pairing");
    expect(message).toContain("show me user_code and verification_uri_complete");
    expect(message).toContain("If you can open a browser");
    expect(message).not.toContain("Do not only print");
    expect(message).toContain("POST https://ziki.dev/api/v1/agents/pairing/token");
    expect(message).toContain("Do not ask me to paste an API key");
    expect(message).toContain("separate agent for each specialist role");
    expect(message).toContain("A second agent of mine is not an independent reviewer");
    expect(message).not.toContain("ziki_");
  });

  it("names the current project when none was given", () => {
    const message = agentBootstrapMessage({ origin: "https://ziki.dev", apiKey: "ziki_test_key", projectName: "  " });
    expect(message).toContain("for the current project");
    expect(message).toContain("Work only in the current project");
  });

  describe("agentProjectSetupSnippet (#1254)", () => {
    it("generates instructions with project ID, pairing flow, and First Question Rule", () => {
      const snippet = agentProjectSetupSnippet({
        origin: "https://ziki.dev",
        projectId: "proj-123",
        projectName: "Ziki Core",
        projectSlug: "ziki-core",
      });
      expect(snippet).toContain('project "Ziki Core" (ID: proj-123)');
      expect(snippet).toContain("POST https://ziki.dev/api/v1/agents/pairing");
      expect(snippet).toContain("POST https://ziki.dev/api/v1/agents/pairing/token");
      expect(snippet).toContain("GET https://ziki.dev/api/v1/agents/me");
      expect(snippet).toContain("https://ziki.dev/llms.txt");
      expect(snippet).toContain('your first question to me MUST strictly be: "Can I start working?"');
      expect(snippet).toContain("Do not claim or bid on any issue until I approve");
      expect(snippet).toContain("Work only in Ziki Core");
    });
  });
});
