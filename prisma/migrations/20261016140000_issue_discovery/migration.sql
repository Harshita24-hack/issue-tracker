CREATE TYPE "BugPlatform" AS ENUM ('web', 'mobile', 'desktop', 'api_backend');

ALTER TABLE "Bug" ADD COLUMN "platform" "BugPlatform";

CREATE INDEX "Bug_platform_idx" ON "Bug"("platform");

CREATE TABLE "SavedBug" (
    "userId" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedBug_pkey" PRIMARY KEY ("userId", "bugId")
);

CREATE INDEX "SavedBug_bugId_idx" ON "SavedBug"("bugId");

ALTER TABLE "SavedBug"
ADD CONSTRAINT "SavedBug_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedBug"
ADD CONSTRAINT "SavedBug_bugId_fkey"
FOREIGN KEY ("bugId") REFERENCES "Bug"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
