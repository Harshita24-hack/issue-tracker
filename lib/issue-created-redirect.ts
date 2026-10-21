/**
 * True when `error` is the redirect Next.js throws after a successful issue
 * creation (`redirect("/issues/<id>")` in createBugAction).
 *
 * Next.js rejects the client action promise with that redirect, so code placed
 * after `await createBugAction()` never runs on success. The digest has the
 * form `NEXT_REDIRECT;<type>;<url>;<status>;`. Only a redirect to an issue
 * page counts: a redirect to `/login` (expired session) must keep the draft.
 */
export function isIssueCreatedRedirect(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string") return false;
  const parts = digest.split(";");
  if (parts[0] !== "NEXT_REDIRECT") return false;
  const url = parts.slice(2, -2).join(";");
  return /^\/issues\/[^/?#]+$/.test(url);
}
