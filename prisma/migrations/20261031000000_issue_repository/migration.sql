-- #1047: every issue names the GitHub repository its work happens in.
ALTER TABLE "Bug" ADD COLUMN "repositoryUrl" TEXT;

-- Existing issues start with their project's repository, normalised to
-- https://github.com/owner/repo (no trailing slash or .git).
UPDATE "Bug" AS b
SET "repositoryUrl" = regexp_replace(
  regexp_replace(trim(p."repoUrl"), '(\.git)?/*$', ''),
  '^http://', 'https://'
)
FROM "Project" AS p
WHERE b."projectId" = p."id"
  AND p."repoUrl" IS NOT NULL
  AND trim(p."repoUrl") ~* '^https?://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\.git)?/?$';
