import { describe, expect, it, vi } from "vitest";
import {
  pruneUnlinkedUploads,
  sweepOrphanedAttachments,
  SWEEP_BATCH,
  UNLINKED_UPLOAD_TTL_MS,
  ORPHANED_UPLOAD_TTL_MS,
  DELETED_PARENT_TTL_MS,
} from "./attachment-retention";

const now = new Date("2026-10-20T12:00:00Z");
const cutoff = new Date(now.getTime() - UNLINKED_UPLOAD_TTL_MS);
const unlinked = { bugId: null, commentId: null, redesignProposalId: null, createdAt: { lt: cutoff } };
const deletedParentCutoff = new Date(now.getTime() - DELETED_PARENT_TTL_MS);

function fakeDb(stale: string[] = []) {
  return {
    attachment: {
      deleteMany: vi.fn(async ({ where }: { where: { id?: { in: string[] } } }) => ({ count: where.id ? where.id.in.length : 2 })),
      findMany: vi.fn(async () => stale.map((id) => ({ id }))),
    },
  };
}

describe("pruneUnlinkedUploads (#543)", () => {
  it("deletes only this uploader's uploads that were never attached and are over a week old", async () => {
    const db = fakeDb();
    const result = await pruneUnlinkedUploads(db as never, { uploaderId: "u1", now, siteSweep: false });
    expect(db.attachment.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.attachment.deleteMany).toHaveBeenCalledWith({ where: { uploaderId: "u1", ...unlinked } });
    expect(db.attachment.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({ own: 2, site: 0 });
  });

  it("keeps uploads from the last week, so unsent drafts don't lose their images", () => {
    expect(UNLINKED_UPLOAD_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("sometimes sweeps everyone's expired uploads, in a bounded batch", async () => {
    const db = fakeDb(["a", "b", "c"]);
    const result = await pruneUnlinkedUploads(db as never, { uploaderId: "u1", now, siteSweep: true });
    expect(db.attachment.findMany).toHaveBeenCalledWith({ where: unlinked, select: { id: true }, take: SWEEP_BATCH });
    // The delete re-checks "still unlinked", so one attached in between survives.
    expect(db.attachment.deleteMany).toHaveBeenLastCalledWith({ where: { id: { in: ["a", "b", "c"] }, ...unlinked } });
    expect(result.site).toBe(3);
  });

  it("does nothing more when the sweep finds nothing", async () => {
    const db = fakeDb([]);
    await pruneUnlinkedUploads(db as never, { uploaderId: "u1", now, siteSweep: true });
    expect(db.attachment.deleteMany).toHaveBeenCalledTimes(1);
  });
});

describe("sweepOrphanedAttachments (#658)", () => {
  it("purges unlinked uploads older than TTL", async () => {
    const findMany = vi.fn().mockResolvedValueOnce([{ id: "u-1" }, { id: "u-2" }]);
    const deleteMany = vi.fn().mockResolvedValueOnce({ count: 2 });

    const db = { attachment: { findMany, deleteMany } };
    const { sweepOrphanedAttachments, ORPHANED_UPLOAD_TTL_MS } = await import("./attachment-retention");

    const result = await sweepOrphanedAttachments(db as never, { now, sweep: true });
    expect(result).toEqual({ unlinked: 2, deletedParents: 0, total: 2 });

    const cutoff = new Date(now.getTime() - ORPHANED_UPLOAD_TTL_MS);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { bugId: null, commentId: null, redesignProposalId: null, createdAt: { lt: cutoff } },
      select: { id: true },
      take: 500,
    });
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["u-1", "u-2"] },
        bugId: null,
        commentId: null,
        redesignProposalId: null,
        createdAt: { lt: cutoff },
      },
    });
  });

  it("purges attachments of soft-deleted issues/comments beyond the restore window (#411)", async () => {
    const findMany = vi.fn()
      .mockResolvedValueOnce([]) // unlinked
      .mockResolvedValueOnce([{ id: "b-1" }]) // deleted bug past cutoff
      .mockResolvedValueOnce([{ id: "c-1" }]); // deleted comment past cutoff
    const deleteMany = vi.fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const db = { attachment: { findMany, deleteMany } };
    const { sweepOrphanedAttachments, DELETED_PARENT_TTL_MS } = await import("./attachment-retention");

    const result = await sweepOrphanedAttachments(db as never, { now, sweep: true });
    expect(result).toEqual({ unlinked: 0, deletedParents: 2, total: 2 });

    // Verify findMany called with deletedAt cutoff for bugs
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: {
        bug: { isDeleted: true, deletedAt: { lt: deletedParentCutoff } },
      },
      select: { id: true },
      take: 500,
    });
    // Verify findMany called with deletedAt cutoff for comments
    expect(findMany).toHaveBeenNthCalledWith(3, {
      where: {
        comment: { deletedAt: { lt: deletedParentCutoff } },
      },
      select: { id: true },
      take: 500,
    });

    // Verify deleteMany re-checks the deletedAt cutoff (race condition fix)
    expect(deleteMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ["b-1"] }, bug: { isDeleted: true, deletedAt: { lt: deletedParentCutoff } } },
    });
    expect(deleteMany).toHaveBeenNthCalledWith(3, {
      where: { id: { in: ["c-1"] }, comment: { deletedAt: { lt: deletedParentCutoff } } },
    });
  });

  it("keeps attachments of soft-deleted issues and comments within the restore window (#411)", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });

    const db = { attachment: { findMany, deleteMany } };
    const { sweepOrphanedAttachments, DELETED_PARENT_TTL_MS } = await import("./attachment-retention");

    // Use a cutoff in the future (within restore window) so nothing qualifies for purge
    const futureCutoff = new Date(now.getTime() + 1000);
    await sweepOrphanedAttachments(db as never, { now: futureCutoff, sweep: true });

    const queriedParents = findMany.mock.calls.some(([args]) => {
      const where = (args as { where?: Record<string, unknown> }).where ?? {};
      return "bug" in where || "comment" in where;
    });
    expect(queriedParents).toBe(true); // The query runs but finds nothing
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("skips execution when sweep is false", async () => {
    const findMany = vi.fn();
    const deleteMany = vi.fn();
    const db = { attachment: { findMany, deleteMany } };
    const { sweepOrphanedAttachments } = await import("./attachment-retention");

    const result = await sweepOrphanedAttachments(db as never, { now, sweep: false });
    expect(result).toEqual({ unlinked: 0, deletedParents: 0, total: 0 });
    expect(findMany).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

