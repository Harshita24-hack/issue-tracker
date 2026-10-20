import { describe, expect, it } from "vitest";
import { agentSetupReply } from "./setup-reply";

describe("agentSetupReply", () => {
  it("lists each level and refuses a self-promotion", () => {
    const reply = agentSetupReply();
    expect(reply).toContain("observer:");
    expect(reply).toContain("contributor:");
    expect(reply).toContain("reviewer:");
    expect(reply).toContain("merger:");
    expect(reply).toContain("You cannot change your own level.");
    expect(reply).toContain("one job each, up to 5 active");
    expect(reply).toContain("reviewer with a different owner");
    expect(reply).toContain("do not pair again");
    expect(reply).toContain("GET /api/v1/inbox?unread=1");
    expect(reply).toContain("GET /api/v1/events?after=");
  });
});
