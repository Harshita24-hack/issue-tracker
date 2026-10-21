import { describe, expect, it, vi } from "vitest";
import { mergeEntryBody, postConversationEntry, validationEntryBody, verdictEntryBody } from "./conversation-entries";

/** #1045: each step is also a typed entry in the issue's conversation, with what it says in its text. */

describe("postConversationEntry", () => {
  it("writes a typed comment for the agent's owner, with the step in metadata", async () => {
    const create = vi.fn<(args: { data: Record<string, unknown> }) => Promise<{ id: string }>>(async () => ({ id: "c1" }));
    const entry = await postConversationEntry({ comment: { create } } as never, {
      bugId: "bug-1", authorId: "ada", agentId: "agent-ada", type: "validation",
      body: "  Agreed: this is a real issue.  ", metadata: { validationId: "v1" }, parentId: "c0",
    });
    expect(entry).toEqual({ id: "c1" });
    expect(create).toHaveBeenCalledWith({
      data: { bugId: "bug-1", authorId: "ada", agentId: "agent-ada", type: "validation", body: "Agreed: this is a real issue.", parentId: "c0", metadata: { validationId: "v1" } },
      select: { id: true },
    });
  });

  it("never posts an empty entry, and skips a database without comments", async () => {
    const create = vi.fn<(args: { data: Record<string, unknown> }) => Promise<{ id: string }>>(async () => ({ id: "c1" }));
    await postConversationEntry({ comment: { create } } as never, { bugId: "b", authorId: "a", type: "merge", body: " " });
    expect(create.mock.calls[0][0].data.body).toBe("Accepted the fix.");
    expect(await postConversationEntry({} as never, { bugId: "b", authorId: "a", type: "merge", body: "x" })).toBeNull();
  });
});

describe("entry text", () => {
  it("says the validation's verdict, then the reviewer's notes", () => {
    expect(validationEntryBody({ kind: "real", verdict: "accept", severity: "high", notes: "Reproduced at 375px." }))
      .toBe("Agreed: this is a real issue (severity high).\n\nReproduced at 375px.");
    expect(validationEntryBody({ kind: "duplicate", verdict: "reject" })).toBe("Disagreed: this is a duplicate.");
  });

  it("says the verdict and the merge", () => {
    expect(verdictEntryBody({ goodToMerge: true, notes: "Checks pass." })).toBe("Good to merge.\n\nChecks pass.");
    expect(verdictEntryBody({ goodToMerge: false, changed: true })).toBe("Changed my verdict: Not good to merge yet.");
    expect(mergeEntryBody({ pullRequestUrl: "https://github.com/a/b/pull/3", headSha: "abcdef1234" }))
      .toBe("Accepted the fix in https://github.com/a/b/pull/3 at abcdef1.");
  });
});
