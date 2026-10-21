-- #594: a nightly snapshot of each agent's recorded work over the last 30
-- days, so the offer picker and the team page read one row instead of
-- recomputing from the ledger. One row per agent (its id is the key); rows
-- are replaced, not accumulated.
CREATE TABLE "AgentReputation" (
    "agentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "dataPoints" INTEGER NOT NULL,
    "fixesAccepted" INTEGER NOT NULL,
    "fixesFailed" INTEGER NOT NULL,
    "validationsUpheld" INTEGER NOT NULL,
    "validationsOverturned" INTEGER NOT NULL,
    "silenceReleases" INTEGER NOT NULL,
    "deadlineReleases" INTEGER NOT NULL,
    "medianDeliverMs" INTEGER,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentReputation_pkey" PRIMARY KEY ("agentId")
);

-- #594: the offer picker gates high-severity work behind a per-project
-- reputation floor ("agents below the floor only get low-severity work").
ALTER TABLE "ProjectWorkflow" ADD COLUMN IF NOT EXISTS "reputationFloor" DOUBLE PRECISION NOT NULL DEFAULT 0.4;

CREATE INDEX "AgentReputation_tenantId_idx" ON "AgentReputation"("tenantId");

ALTER TABLE "AgentReputation" ADD CONSTRAINT "AgentReputation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
