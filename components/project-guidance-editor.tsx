"use client";

import { useState, useTransition } from "react";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { updateMasterGuidanceAction } from "@/app/(app)/projects/[slug]/guidance/actions";

interface MasterGuidanceEditorProps {
  slug: string;
  initialBody: string;
  isAdmin: boolean;
  updatedAt: string | Date;
}

export function MasterGuidanceEditor({
  slug,
  initialBody,
  isAdmin,
  updatedAt,
}: MasterGuidanceEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateMasterGuidanceAction(slug, body);
      if (res.ok) {
        setIsEditing(false);
      } else {
        setError(res.error);
      }
    });
  };

  const handleCancel = () => {
    setBody(initialBody);
    setIsEditing(false);
    setError(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Master Project Guidance</h2>
          <p className="text-xs text-slate-500">
            Authoritative source of truth queried by agents via{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">
              GET /api/v1/projects/:id/guidance
            </code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && !isEditing && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsEditing(true)}
            >
              Edit Master Guidance
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {isEditing ? (
        <div className="mt-4 space-y-4">
          <label htmlFor="guidance-body-input" className="block text-xs font-medium text-slate-700">
            Guidance Markdown Document
          </label>
          <textarea
            id="guidance-body-input"
            rows={14}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={isPending}
            className="w-full rounded-lg border border-slate-300 p-3 font-mono text-sm leading-relaxed text-slate-900 shadow-inner focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            placeholder="# Project Guidance..."
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCancel}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? "Saving..." : "Save Guidance"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          {body ? (
            <RichText content={body} />
          ) : (
            <p className="py-6 text-center text-sm italic text-slate-400">
              No master guidance has been written yet.
            </p>
          )}
          <div className="mt-6 border-t border-slate-100 pt-3 text-right text-xs text-slate-400">
            Last updated: {new Date(updatedAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
