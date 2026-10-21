import { z } from "zod";

/**
 * #1047: Ziki is the issue tracker and GitHub is only where the work happens,
 * so every issue names the repository its pull request goes to. It starts as
 * the project's repository, and can differ: one project can span several.
 */

export const REPOSITORY_URL_MESSAGE =
  "Enter a GitHub repository URL, such as https://github.com/owner/repository.";

const NAME = "[A-Za-z0-9_.-]+";
const SCP = new RegExp(`^git@github\\.com:(${NAME})\\/(${NAME}?)(?:\\.git)?$`, "i");

/**
 * `https://github.com/owner/repo`, or null when the value isn't exactly a
 * GitHub repository: a page inside one (a pull request, a file) is refused,
 * so the field can't quietly hold the wrong thing.
 *
 * Self-contained on purpose: lib/github/merge-pr reaches the agent API,
 * which imports this file.
 */
export function normalizeRepositoryUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const scp = SCP.exec(trimmed);
  if (scp) return `https://github.com/${scp[1]}/${scp[2]}`;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || url.hostname.toLowerCase() !== "github.com") return null;
  if (url.port || url.username || url.password || url.search || url.hash) return null;
  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length !== 2) return null;
  const [owner, repoRaw] = parts;
  const repo = repoRaw!.replace(/\.git$/i, "");
  const valid = new RegExp(`^${NAME}$`);
  if (!valid.test(owner!) || !valid.test(repo) || !repo) return null;
  return `https://github.com/${owner}/${repo}`;
}

/**
 * Optional repository field from a form or a request: blank means "not
 * given" (`undefined`), anything else must be a GitHub repository.
 */
export const repositoryUrlSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) return undefined;
    const normalized = normalizeRepositoryUrl(trimmed);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: REPOSITORY_URL_MESSAGE });
      return z.NEVER;
    }
    return normalized;
  });

/** The repository an issue's work happens in: its own, else its project's. */
export function issueRepositoryUrl(bug: {
  repositoryUrl?: string | null;
  project?: { repoUrl?: string | null } | null;
}): string | null {
  return bug.repositoryUrl ?? normalizeRepositoryUrl(bug.project?.repoUrl ?? null);
}
