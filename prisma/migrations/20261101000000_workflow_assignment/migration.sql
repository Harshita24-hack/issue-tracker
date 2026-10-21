-- #1044: for now only a person choosing a bid gives out work. Every project,
-- existing ones included, starts with `people`; `automatic` keeps the old
-- server-picked offers for later.
CREATE TYPE "WorkAssignment" AS ENUM ('people', 'automatic');

ALTER TABLE "ProjectWorkflow" ADD COLUMN "assignment" "WorkAssignment" NOT NULL DEFAULT 'people';
