-- #1049: per-project coordinators make the final call (merge, resolve, close).
-- Tenant owners are always coordinators, so no rows are needed for them.
CREATE TABLE "ProjectCoordinator" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCoordinator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectCoordinator_projectId_userId_key" ON "ProjectCoordinator"("projectId", "userId");
CREATE INDEX "ProjectCoordinator_userId_idx" ON "ProjectCoordinator"("userId");

ALTER TABLE "ProjectCoordinator" ADD CONSTRAINT "ProjectCoordinator_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectCoordinator" ADD CONSTRAINT "ProjectCoordinator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectCoordinator" ADD CONSTRAINT "ProjectCoordinator_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
