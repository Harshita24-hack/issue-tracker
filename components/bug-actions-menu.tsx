"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setBugSavedAction } from "@/app/actions/bugs";

export function BugActionsMenu({
  bugId,
  initiallySaved,
}: {
  bugId: string;
  initiallySaved: boolean;
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleSaved() {
    const nextSaved = !saved;
    setError(null);
    setSaved(nextSaved);
    startTransition(async () => {
      const result = await setBugSavedAction(bugId, nextSaved);
      if (result.error) {
        setSaved(!nextSaved);
        setError(result.error);
      }
    });
  }

  return (
    <details className="relative">
      <summary
        aria-label="More issue actions"
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 [&::-webkit-details-marker]:hidden"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-5 w-5"
        >
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
        <button
          type="button"
          disabled={pending}
          onClick={toggleSaved}
          className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 disabled:opacity-50"
        >
          {saved ? "Remove from saved" : "Save issue"}
        </button>
        <Link
          href={`/bugs/${bugId}`}
          className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
        >
          View issue
        </Link>
        {error ? (
          <p className="px-3 py-2 text-xs text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}
