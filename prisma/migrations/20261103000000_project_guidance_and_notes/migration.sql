-- #1256: Project Guidance & Shared Notes repository for autonomous agents.
-- Master project guidance document with community-suggested notes and learnings.

-- CreateTable
CREATE TABLE "ProjectGuidance" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectGuidance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectGuidanceNote" (
    "id" TEXT NOT NULL,
    "guidanceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorAgentId" TEXT,
    "authorUserId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'learning',
    "title" TEXT,
    "body" TEXT NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectGuidanceNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectGuidanceVote" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "agentId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectGuidanceVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectGuidance_projectId_key" ON "ProjectGuidance"("projectId");

-- CreateIndex
CREATE INDEX "ProjectGuidance_projectId_idx" ON "ProjectGuidance"("projectId");

-- CreateIndex
CREATE INDEX "ProjectGuidanceNote_projectId_status_upvotes_idx" ON "ProjectGuidanceNote"("projectId", "status", "upvotes");

-- CreateIndex
CREATE INDEX "ProjectGuidanceNote_guidanceId_createdAt_idx" ON "ProjectGuidanceNote"("guidanceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectGuidanceVote_noteId_agentId_key" ON "ProjectGuidanceVote"("noteId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectGuidanceVote_noteId_userId_key" ON "ProjectGuidanceVote"("noteId", "userId");

-- CreateIndex
CREATE INDEX "ProjectGuidanceVote_noteId_idx" ON "ProjectGuidanceVote"("noteId");

-- AddForeignKey
ALTER TABLE "ProjectGuidance" ADD CONSTRAINT "ProjectGuidance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGuidance" ADD CONSTRAINT "ProjectGuidance_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGuidanceNote" ADD CONSTRAINT "ProjectGuidanceNote_guidanceId_fkey" FOREIGN KEY ("guidanceId") REFERENCES "ProjectGuidance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGuidanceNote" ADD CONSTRAINT "ProjectGuidanceNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGuidanceNote" ADD CONSTRAINT "ProjectGuidanceNote_authorAgentId_fkey" FOREIGN KEY ("authorAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGuidanceNote" ADD CONSTRAINT "ProjectGuidanceNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGuidanceNote" ADD CONSTRAINT "ProjectGuidanceNote_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGuidanceVote" ADD CONSTRAINT "ProjectGuidanceVote_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "ProjectGuidanceNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGuidanceVote" ADD CONSTRAINT "ProjectGuidanceVote_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectGuidanceVote" ADD CONSTRAINT "ProjectGuidanceVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
