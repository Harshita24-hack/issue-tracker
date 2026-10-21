"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editRepositoryAction } from "@/app/actions/issues";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** `owner/repo` for a GitHub repository URL. */
function repoLabel(url: string): string {
  return url.replace(/^https:\/\/github\.com\//, "");
}

/**
 * #1047: the GitHub repository an issue's work happens in, shown with the
 * issue's details. The reporter or an admin can change it; blank goes back
 * to the project's repository.
 */
export function EditableRepository({
  bugId,
  repositoryUrl,
  canEdit,
}: {
  bugId: string;
  repositoryUrl: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(repositoryUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          setError(null);
          const formData = new FormData();
          formData.set("repositoryUrl", value);
          startTransition(async () => {
            const result = await editRepositoryAction(bugId, formData);
            if (result.error) setError(result.error);
            else {
              setEditing(false);
              router.refresh();
            }
          });
        }}
      >
        <label htmlFor={`repository-${bugId}`} className="sr-only">
          Repository
        </label>
        <Input
          id={`repository-${bugId}`}
          type="url"
          inputMode="url"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://github.com/owner/repository"
          disabled={pending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `repository-${bugId}-error` : undefined}
        />
        {error ? (
          <p id={`repository-${bugId}-error`} role="alert" className="text-xs text-red-700">
            {error}
          </p>
        ) : (
          <p className="text-xs text-slate-500">Leave empty to use the project&apos;s repository.</p>
        )}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setValue(repositoryUrl ?? "");
              setError(null);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {repositoryUrl ? (
        <a href={repositoryUrl} target="_blank" rel="noopener noreferrer" className="break-all text-teal-700 hover:underline">
          {repoLabel(repositoryUrl)}
        </a>
      ) : (
        <span className="text-slate-500">Not set</span>
      )}
      {canEdit ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline"
          aria-label="Change the repository"
        >
          Change
        </button>
      ) : null}
    </span>
  );
}
