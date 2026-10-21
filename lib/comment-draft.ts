/**
 * Unsent comment text, kept per issue (and per reply) so navigating away,
 * reloading or closing the tab does not throw away what someone had typed.
 *
 * Storage is per-browser and per-viewer: nothing here reaches the server or
 * another device, and every access is wrapped because private-mode and
 * blocked-site-data both make these throw rather than return nothing.
 */

const PREFIX = "comment-draft";

/** Drafts older than this are dropped on read rather than kept forever. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type StoredDraft = { body: string; savedAt: number };

export function draftKey(
  bugId: string,
  parentId?: string | null,
  userId?: string | null,
): string {
  const userSegment = userId ? userId : "anon";
  return `${PREFIX}:${userSegment}:${bugId}:${parentId ?? "root"}`;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The saved draft, or "" when there is none, it is stale, or it is unreadable. */
export function readDraft(store: Store, key: string, now = Date.now()): string {
  let raw: string | null = null;
  try {
    raw = store.getItem(key);
  } catch {
    return "";
  }
  if (!raw) return "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Someone else's key, or a half-written value.
    clearDraft(store, key);
    return "";
  }

  const draft = parsed as Partial<StoredDraft>;
  if (typeof draft?.body !== "string" || typeof draft?.savedAt !== "number") {
    clearDraft(store, key);
    return "";
  }
  if (now - draft.savedAt > DRAFT_TTL_MS) {
    clearDraft(store, key);
    return "";
  }
  return draft.body;
}

/** Saves a draft, or removes it when the field has been emptied. */
export function writeDraft(
  store: Store,
  key: string,
  body: string,
  now = Date.now(),
): void {
  if (!body.trim()) {
    clearDraft(store, key);
    return;
  }
  try {
    store.setItem(key, JSON.stringify({ body, savedAt: now } satisfies StoredDraft));
  } catch {
    // Storage full or unavailable. The comment still posts; only the draft
    // is lost, which is no worse than before drafts existed.
  }
}

export function clearDraft(store: Store, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // As above.
  }
}

/** Clear all comment drafts for a given user (or all if none provided), including legacy unscoped drafts (#1168) */
export function clearUserCommentDrafts(store: Storage, userId?: string | null): void {
  try {
    const keysToRemove: string[] = [];
    const prefix = userId ? `${PREFIX}:${userId}:` : `${PREFIX}:`;
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key) continue;
      // Match scoped drafts: comment-draft:<userId>:... or comment-draft:... if userId not provided
      // If userId is provided, also remove legacy unscoped drafts (comment-draft:<bugId>:<parentId> without user)
      // to avoid leaking into other accounts.
      if (key.startsWith(prefix)) {
        keysToRemove.push(key);
      } else if (userId && key.startsWith(`${PREFIX}:`)) {
        // Check if this is a legacy unscoped key: exactly 3 parts `comment-draft:<bugId>:<parentId>`
        const parts = key.split(":");
        if (parts.length === 3) {
          keysToRemove.push(key);
        }
      }
    }
    for (const key of keysToRemove) {
      store.removeItem(key);
    }
  } catch {
    // Ignore error
  }
}
