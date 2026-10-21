import type { CommentType, Prisma, PrismaClient } from "@prisma/client";

/**
 * Typed entries in an issue's conversation (#1045). Each step of the work —
 * a validation, a test verdict, a merge, an escalation — is also a comment of
 * its type, with what it says in its text, so the conversation carries the
 * work. The structured records (IssueValidation, TestVerdict, the acceptance)
 * stay: the merge gate and the points still read them.
 *
 * Self-contained on purpose: the agent API modules that call this import each
 * other, and a helper that pulled any of them in would close the loop.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** Comment types that only appear because a step happened (or, sent to POST /comments, make it happen). */
export const ACTION_COMMENT_TYPES = ["validation", "merge", "escalation"] as const satisfies readonly CommentType[];

/** Comment types a person picks in the web form. The rest come from the steps themselves. */
export const CONVERSATION_COMMENT_TYPES = ["comment", "bid", "review", "delivery", "request_to_merge"] as const satisfies readonly CommentType[];

export type ConversationEntryInput = {
  bugId: string;
  /** The person the entry is for: the agent's owner, or a person. */
  authorId: string;
  agentId?: string | null;
  type: CommentType;
  body: string;
  metadata?: Record<string, unknown>;
  parentId?: string | null;
};

const BODY_MAX = 2000;

/**
 * Posts one typed entry, inside the caller's transaction. A test double
 * without a comment delegate is skipped, so the step's own behaviour (and its
 * existing tests) doesn't depend on the conversation.
 */
export async function postConversationEntry(db: Db, input: ConversationEntryInput): Promise<{ id: string } | null> {
  const delegate = (db as { comment?: { create?: unknown } }).comment;
  if (typeof delegate?.create !== "function") return null;
  const body = input.body.trim().slice(0, BODY_MAX) || defaultBody(input.type);
  return db.comment.create({
    data: {
      bugId: input.bugId,
      authorId: input.authorId,
      agentId: input.agentId ?? null,
      type: input.type,
      body,
      parentId: input.parentId ?? null,
      metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
    },
    select: { id: true },
  });
}

function defaultBody(type: CommentType): string {
  switch (type) {
    case "validation":
      return "Validated this issue.";
    case "merge":
      return "Accepted the fix.";
    case "escalation":
      return "Escalated this to a person.";
    case "review":
      return "Reviewed the fix.";
    default:
      return "Updated this issue.";
  }
}

const KIND_TEXT: Record<string, string> = {
  real: "is a real issue",
  format: "is well formed",
  duplicate: "is a duplicate",
  fix: "is fixed",
};

/** The text of a validation entry: the reviewer's notes, after a one-line verdict. */
export function validationEntryBody(input: {
  kind: string;
  verdict: "accept" | "reject";
  severity?: string | null;
  notes?: string | null;
}): string {
  const claim = KIND_TEXT[input.kind] ?? `passes the ${input.kind} check`;
  const head = `${input.verdict === "accept" ? "Agreed" : "Disagreed"}: this ${claim}${
    input.verdict === "accept" && input.severity ? ` (severity ${input.severity})` : ""
  }.`;
  return input.notes?.trim() ? `${head}\n\n${input.notes.trim()}` : head;
}

/** The text of a test verdict's review entry. */
export function verdictEntryBody(input: { goodToMerge: boolean; notes?: string | null; changed?: boolean }): string {
  const head = `${input.changed ? "Changed my verdict: " : ""}${input.goodToMerge ? "Good to merge." : "Not good to merge yet."}`;
  return input.notes?.trim() ? `${head}\n\n${input.notes.trim()}` : head;
}

/** The text of a merge entry. */
export function mergeEntryBody(input: { pullRequestUrl: string | null; headSha?: string | null }): string {
  const sha = input.headSha ? ` at ${input.headSha.slice(0, 7)}` : "";
  return input.pullRequestUrl ? `Accepted the fix in ${input.pullRequestUrl}${sha}.` : "Accepted the fix.";
}
