import { describe, expect, it } from "vitest";
import {
  DRAFT_TTL_MS,
  clearDraft,
  clearUserCommentDrafts,
  draftKey,
  readDraft,
  writeDraft,
} from "./comment-draft";

function store(initial: Record<string, string> = {}) {
  const held = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => held.get(k) ?? null,
    setItem: (k: string, v: string) => void held.set(k, v),
    removeItem: (k: string) => void held.delete(k),
    size: () => held.size,
    raw: (k: string) => held.get(k),
  };
}

const angry = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
  removeItem() {
    throw new Error("blocked");
  },
};

describe("draftKey", () => {
  it("separates each issue, and a reply from the issue's own box", () => {
    expect(draftKey("b1")).not.toBe(draftKey("b2"));
    expect(draftKey("b1")).not.toBe(draftKey("b1", "c9"));
    expect(draftKey("b1", "c9")).not.toBe(draftKey("b1", "c8"));
  });

  it("separates different users on the same issue and reply (#1168)", () => {
    expect(draftKey("b1", null, "user-a")).not.toBe(draftKey("b1", null, "user-b"));
    expect(draftKey("b1", "c1", "user-a")).not.toBe(draftKey("b1", "c1", "user-b"));
  });

  it("is stable for the same inputs", () => {
    expect(draftKey("b1", "c9")).toBe(draftKey("b1", "c9"));
    expect(draftKey("b1", "c9", "user-a")).toBe(draftKey("b1", "c9", "user-a"));
  });
});

describe("writeDraft and readDraft", () => {
  it("round-trips what was typed", () => {
    const s = store();
    writeDraft(s, "k", "half a thought");
    expect(readDraft(s, "k")).toBe("half a thought");
  });

  it("removes the entry when the box is emptied", () => {
    const s = store();
    writeDraft(s, "k", "something");
    writeDraft(s, "k", "   ");
    expect(s.size()).toBe(0);
    expect(readDraft(s, "k")).toBe("");
  });

  it("returns nothing for a key that was never written", () => {
    expect(readDraft(store(), "k")).toBe("");
  });

  it("drops a draft older than the TTL, and keeps one inside it", () => {
    const s = store();
    const then = 1_000_000;
    writeDraft(s, "k", "old", then);
    expect(readDraft(s, "k", then + DRAFT_TTL_MS - 1)).toBe("old");
    expect(readDraft(s, "k", then + DRAFT_TTL_MS + 1)).toBe("");
    expect(s.size()).toBe(0);
  });

  it("discards junk and the wrong shape rather than returning it", () => {
    const s = store({ a: "not json", b: JSON.stringify({ nope: 1 }), c: JSON.stringify({ body: 5, savedAt: 1 }) });
    for (const key of ["a", "b", "c"]) {
      expect(readDraft(s, key), key).toBe("");
    }
    expect(s.size()).toBe(0);
  });

  it("survives storage that throws on every call", () => {
    // Private-mode Safari and blocked site data both behave this way. The
    // comment still posts; only the draft is lost.
    expect(readDraft(angry, "k")).toBe("");
    expect(() => writeDraft(angry, "k", "x")).not.toThrow();
    expect(() => clearDraft(angry, "k")).not.toThrow();
  });
});

describe("clearDraft", () => {
  it("removes only that key", () => {
    const s = store();
    writeDraft(s, "a", "one");
    writeDraft(s, "b", "two");
    clearDraft(s, "a");
    expect(readDraft(s, "a")).toBe("");
    expect(readDraft(s, "b")).toBe("two");
  });
});

describe("clearUserCommentDrafts and account isolation (#1168)", () => {
  it("isolates user A and user B drafts and clears user A on logout without touching user B", () => {
    // Implement standard Storage mock
    const map = new Map<string, string>();
    const storage: Storage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
      clear: () => map.clear(),
      get length() {
        return map.size;
      },
      key: (i) => Array.from(map.keys())[i] ?? null,
    };

    const keyARoot = draftKey("bug-1", null, "user-a");
    const keyAReply = draftKey("bug-1", "reply-1", "user-a");
    const keyBRoot = draftKey("bug-1", null, "user-b");
    const keyBReply = draftKey("bug-1", "reply-1", "user-b");

    writeDraft(storage, keyARoot, "A root draft");
    writeDraft(storage, keyAReply, "A reply draft");
    writeDraft(storage, keyBRoot, "B root draft");
    writeDraft(storage, keyBReply, "B reply draft");

    // Legacy unscoped draft in storage from an earlier version
    const legacyKey = "comment-draft:bug-1:root";
    writeDraft(storage, legacyKey, "Legacy draft");

    // Clear user A's drafts (as logout does)
    clearUserCommentDrafts(storage, "user-a");

    // User A's drafts and legacy drafts must be cleared
    expect(readDraft(storage, keyARoot)).toBe("");
    expect(readDraft(storage, keyAReply)).toBe("");
    expect(readDraft(storage, legacyKey)).toBe("");

    // User B's drafts must remain untouched
    expect(readDraft(storage, keyBRoot)).toBe("B root draft");
    expect(readDraft(storage, keyBReply)).toBe("B reply draft");
  });
});
