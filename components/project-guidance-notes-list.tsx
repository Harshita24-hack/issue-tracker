"use client";

import { useState, useTransition } from "react";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import {
  acceptGuidanceNoteAction,
  createGuidanceNoteAction,
  upvoteGuidanceNoteAction,
} from "@/app/(app)/projects/[slug]/guidance/actions";
import { GUIDANCE_CATEGORIES, type GuidanceCategory } from "@/lib/validations/guidance";

export interface GuidanceNoteItem {
  id: string;
  category: string;
  title: string | null;
  body: string;
  upvotes: number;
  status: string;
  acceptedAt: string | Date | null;
  createdAt: string | Date;
  authorAgent?: { id: string; name: string } | null;
  authorUser?: { id: string; name: string } | null;
  acceptedBy?: { id: string; name: string } | null;
}

interface GuidanceNotesListProps {
  slug: string;
  initialNotes: GuidanceNoteItem[];
  isAdmin: boolean;
}

export function GuidanceNotesList({
  slug,
  initialNotes,
  isAdmin,
}: GuidanceNotesListProps) {
  const [notes, setNotes] = useState<GuidanceNoteItem[]>(initialNotes);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [formCategory, setFormCategory] = useState<GuidanceCategory>("learning");
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  const filteredNotes = notes.filter((n) => {
    if (categoryFilter !== "all" && n.category !== categoryFilter) return false;
    if (statusFilter !== "all" && n.status !== statusFilter) return false;
    return true;
  });

  const handleUpvote = (noteId: string) => {
    // Optimistic update
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, upvotes: n.upvotes + 1 } : n)),
    );

    startTransition(async () => {
      await upvoteGuidanceNoteAction(slug, noteId);
    });
  };

  const handleAccept = (noteId: string) => {
    startTransition(async () => {
      const res = await acceptGuidanceNoteAction(slug, noteId);
      if (res.ok) {
        setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId
              ? { ...n, status: "accepted", acceptedAt: new Date().toISOString() }
              : n,
          ),
        );
      }
    });
  };

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    const formData = new FormData();
    formData.append("slug", slug);
    formData.append("category", formCategory);
    formData.append("title", formTitle);
    formData.append("body", formBody);

    startTransition(async () => {
      const res = await createGuidanceNoteAction(undefined, formData);
      if (res.ok) {
        setShowAddForm(false);
        setFormTitle("");
        setFormBody("");
      } else {
        setFormError(res.error);
      }
    });
  };

  const categoryColor = (cat: string) => {
    switch (cat) {
      case "learning":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "setup":
        return "bg-sky-50 text-sky-700 border-sky-200";
      case "rule":
        return "bg-purple-50 text-purple-700 border-purple-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Shared Notes & Learnings</h2>
          <p className="text-xs text-slate-500">
            Agents post environment rules and bug workarounds. Highly-upvoted items can be folded into master guidance.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? "Close Form" : "+ Suggest Learning / Note"}
        </Button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleCreateSubmit}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
        >
          <h3 className="text-sm font-semibold text-slate-900">Propose New Guidance Note</h3>
          {formError && (
            <div role="alert" className="rounded-md bg-rose-50 p-2.5 text-xs text-rose-700">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="guidance-category-select" className="block text-xs font-medium text-slate-700">Category</label>
              <select
                id="guidance-category-select"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as GuidanceCategory)}
                className="mt-1 block w-full rounded-md border border-slate-300 py-1.5 px-2 text-xs text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                {GUIDANCE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="guidance-title-input" className="block text-xs font-medium text-slate-700">Title (Optional)</label>
              <input
                id="guidance-title-input"
                type="text"
                placeholder="e.g. Always generate Prisma client after migrations"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 py-1.5 px-2.5 text-xs text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>
          <div>
            <label htmlFor="guidance-body-textarea" className="block text-xs font-medium text-slate-700">Note Content (Markdown supported)</label>
            <textarea
              id="guidance-body-textarea"
              rows={4}
              required
              placeholder="Describe the environment detail, test constraint, or pattern..."
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 p-2.5 text-xs font-mono text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddForm(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || formBody.trim().length < 3}>
              {isPending ? "Submitting..." : "Submit Note"}
            </Button>
          </div>
        </form>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-slate-500 px-1">Category:</span>
          {["all", ...GUIDANCE_CATEGORIES].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategoryFilter(c)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                categoryFilter === c
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="font-medium text-slate-500 px-1">Status:</span>
          {["all", "pending", "accepted"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                statusFilter === s
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Notes List */}
      <div className="space-y-3">
        {filteredNotes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No notes found matching the selected filters.
          </div>
        ) : (
          filteredNotes.map((note) => {
            const author = note.authorAgent
              ? `Agent: ${note.authorAgent.name}`
              : note.authorUser
                ? note.authorUser.name
                : "Anonymous Contributor";
            const isAccepted = note.status === "accepted";

            return (
              <div
                key={note.id}
                className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm transition hover:border-slate-300"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${categoryColor(
                        note.category,
                      )}`}
                    >
                      {note.category.toUpperCase()}
                    </span>
                    {isAccepted ? (
                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                        ✓ Folded into Master Guidance
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                        Pending Coordinator Review
                      </span>
                    )}
                    {note.title && (
                      <h4 className="font-semibold text-slate-900 text-sm">
                        {note.title}
                      </h4>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpvote(note.id)}
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 active:scale-95 transition"
                      title="Upvote note"
                    >
                      <span>▲</span>
                      <span>{note.upvotes}</span>
                    </button>

                    {isAdmin && !isAccepted && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleAccept(note.id)}
                        disabled={isPending}
                        className="text-xs text-teal-700 border-teal-200 hover:bg-teal-50"
                      >
                        Fold into Master
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <RichText content={note.body} />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 border-t border-slate-50 pt-2">
                  <div>
                    Proposed by <span className="font-medium text-slate-600">{author}</span> on{" "}
                    {new Date(note.createdAt).toLocaleDateString()}
                  </div>
                  {isAccepted && note.acceptedAt && (
                    <div className="text-emerald-600">
                      Accepted on {new Date(note.acceptedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
