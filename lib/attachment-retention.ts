import type { PrismaClient } from "@prisma/client";

/**
 * Uploads nobody ever attached are deleted after this long (#543).
 *
 * An upload is stored unlinked until the issue, comment or redesign it was
 * made for is saved. Abandoned forms left those rows, with their bytes,
 * in Postgres forever. A week is generous on purpose: unsent drafts are kept
 * in the browser (#326), and an image in a draft someone finishes days later
 * should still be there.
 */
export const UNLINKED_UPLOAD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Default TTL for orphaned uploads cleanup: 24 hours (#658). */
export const ORPHANED_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

/** How often (1 in N uploads) the site-wide sweep also runs. */
export const SITE_SWEEP_EVERY = 50;

/** Rows removed per sweep, so one request never does unbounded work. */
export const SWEEP_BATCH = 500;

type Db = Pick<PrismaClient, "attachment">;

function unlinkedBefore(cutoff: Date) {
  return { bugId: null, commentId: null, redesignProposalId: null, createdAt: { lt: cutoff } };
}

/**
 * Delete expired unlinked uploads: always this uploader's (cheap, uses the
 * uploaderId/createdAt index), and every SITE_SWEEP_EVERY calls a bounded
 * batch from everyone, so accounts that stopped uploading are cleaned too.
 */
export async function pruneUnlinkedUploads(
  db: Db,
  {
    uploaderId,
    now = new Date(),
    siteSweep = Math.random() * SITE_SWEEP_EVERY < 1,
    ttlMs = UNLINKED_UPLOAD_TTL_MS,
  }: {
    uploaderId: string;
    now?: Date;
    siteSweep?: boolean;
    ttlMs?: number;
  },
): Promise<{ own: number; site: number }> {
  const cutoff = new Date(now.getTime() - ttlMs);
  const own = await db.attachment.deleteMany({ where: { uploaderId, ...unlinkedBefore(cutoff) } });
  let site = 0;
  if (siteSweep) {
    const stale = await db.attachment.findMany({
      where: unlinkedBefore(cutoff),
      select: { id: true },
      take: SWEEP_BATCH,
    });
    if (stale.length > 0) {
      // Re-check "still unlinked" in the delete itself, in case one was attached meanwhile.
      const removed = await db.attachment.deleteMany({
        where: { id: { in: stale.map((row) => row.id) }, ...unlinkedBefore(cutoff) },
      });
      site = removed.count;
    }
  }
  return { own: own.count, site };
}

/**
 * Storage cleanup job to purge orphaned attachments (#658):
 * 1. Unattached uploads older than TTL (default 24 hours).
 *
 * Attachments of soft-deleted issues and comments are deliberately kept:
 * deletion only hides them, and restoring an issue must bring its screenshots
 * and logs back (#411). A permanent purge, if added later, owns that cleanup.
 *
 * Runs in bounded batches to ensure predictable execution time.
 */
export async function sweepOrphanedAttachments(
  db: Db,
  options: {
    now?: Date;
    ttlMs?: number;
    sweep?: boolean;
    batchSize?: number;
  } = {},
): Promise<{ unlinked: number; deletedParents: number; total: number }> {
  const {
    now = new Date(),
    ttlMs = ORPHANED_UPLOAD_TTL_MS,
    sweep = Math.random() * SITE_SWEEP_EVERY < 1,
    batchSize = SWEEP_BATCH,
  } = options;

  if (!sweep) return { unlinked: 0, deletedParents: 0, total: 0 };

  const cutoff = new Date(now.getTime() - ttlMs);

  // Purge unattached uploads older than TTL. Re-check "still unlinked" in the
  // delete itself, in case one was attached meanwhile.
  const staleUnlinked = await db.attachment.findMany({
    where: unlinkedBefore(cutoff),
    select: { id: true },
    take: batchSize,
  });
  let unlinked = 0;
  if (staleUnlinked.length > 0) {
    const removed = await db.attachment.deleteMany({
      where: {
        id: { in: staleUnlinked.map((row) => row.id) },
        ...unlinkedBefore(cutoff),
      },
    });
    unlinked = removed.count;
  }

  return { unlinked, deletedParents: 0, total: unlinked };
}
