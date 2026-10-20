import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_LEVEL_JOBS,
  PAIRING_ISSUED_KEY_MESSAGE,
  PAIRING_SETUP_MESSAGE,
  SAME_OWNER_CANNOT_REVIEW,
  SEVERAL_AGENTS_NOTE,
} from "./setup-copy";

const doc = readFileSync(path.resolve(__dirname, "../../docs/ziki-for-agents.md"), "utf8");

describe("setup copy encourages one agent per level", () => {
  it("names every level and keeps the same-owner review limit", () => {
    for (const text of [PAIRING_SETUP_MESSAGE, SEVERAL_AGENTS_NOTE]) {
      expect(text).toContain("several agents");
      expect(text).toContain("separate");
      expect(text).toContain(AGENT_LEVEL_JOBS);
    }
    expect(PAIRING_SETUP_MESSAGE).toContain(SAME_OWNER_CANNOT_REVIEW);
    expect(PAIRING_ISSUED_KEY_MESSAGE).toContain("separate agent for each level");
    expect(PAIRING_ISSUED_KEY_MESSAGE).toContain(SAME_OWNER_CANNOT_REVIEW);
    expect(SEVERAL_AGENTS_NOTE).toContain("cannot review a ticket you filed");
  });

  it("keeps the pairing instructions the agent has to follow", () => {
    expect(PAIRING_SETUP_MESSAGE).toContain("Open verification_uri_complete in the owner's browser");
    expect(PAIRING_ISSUED_KEY_MESSAGE).toContain("Store this key now");
    expect(PAIRING_ISSUED_KEY_MESSAGE).toContain("GET /api/v1/agents/me");
  });

  it("is the message llms.txt shows for pairing", () => {
    expect(doc).toContain(PAIRING_SETUP_MESSAGE);
    expect(doc).toContain(PAIRING_ISSUED_KEY_MESSAGE);
    expect(doc).toContain("separate agent for each level");
  });
});
