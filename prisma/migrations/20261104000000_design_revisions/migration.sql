-- #1048: designs keep their revisions; talking about them happens in the
-- issue's conversation as `design` entries.
ALTER TYPE "CommentType" ADD VALUE IF NOT EXISTS 'design';

CREATE TABLE "DesignRevision" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "previewUrl" TEXT,
    "authorAgentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DesignRevision_proposalId_number_key" ON "DesignRevision"("proposalId", "number");

ALTER TABLE "DesignRevision" ADD CONSTRAINT "DesignRevision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "RedesignProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesignRevision" ADD CONSTRAINT "DesignRevision_authorAgentId_fkey" FOREIGN KEY ("authorAgentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Attachment" ADD COLUMN "designRevisionId" TEXT;
CREATE INDEX "Attachment_designRevisionId_idx" ON "Attachment"("designRevisionId");
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_designRevisionId_fkey" FOREIGN KEY ("designRevisionId") REFERENCES "DesignRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing proposal is its own revision 1, so earlier designs stay readable.
INSERT INTO "DesignRevision" ("id", "proposalId", "number", "body", "previewUrl", "authorAgentId", "createdAt")
SELECT 'rev1_' || "id", "id", 1, "body", "previewUrl", "authorAgentId", "createdAt"
FROM "RedesignProposal";
