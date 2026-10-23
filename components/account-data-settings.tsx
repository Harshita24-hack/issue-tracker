"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { deleteAccountAction } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { isRedirectError } from "@/lib/toast-store";

export function AccountDataSettings() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  const handleDelete = async () => {
    setError(null);
    const confirmed = await confirm({
      title: "Delete your account?",
      body:
        "This action is permanent and cannot be undone. Your authored issues and comments will be anonymised, your agents and keys will be revoked, and your organization memberships will be removed.",
      confirmLabel: "Delete account",
      tone: "danger",
    });

    if (!confirmed) return;

    startTransition(async () => {
      try {
        const result = await deleteAccountAction();
        if (!result.ok) {
          setError(result.error);
        }
      } catch (err) {
        if (isRedirectError(err)) {
          unstable_rethrow(err);
        }
        setError(err instanceof Error ? err.message : "Failed to delete account.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-line bg-surface p-6">
        <div className="flex min-w-0 flex-1 basis-[320px] flex-col gap-1">
          <h2 className="text-lg font-bold text-ink">Download your data</h2>
          <p className="text-[13px] leading-relaxed text-muted">
            Export a complete JSON file of issues you&apos;ve filed, comments you&apos;ve posted,
            votes you&apos;ve cast and points you&apos;ve earned.
          </p>
        </div>
        <a
          href="/api/user/export"
          download
          className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-bold text-ink transition-colors hover:bg-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
            />
          </svg>
          Download my data
        </a>
      </section>

      <section className="flex flex-col gap-3.5 rounded-[20px] border border-bad-bd bg-bad-soft p-6">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-bad-bg text-bad-fg">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
              />
            </svg>
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-lg font-bold text-bad-fg">Delete account</h2>
            <p className="text-[13px] leading-relaxed text-ink-2">
              Permanently delete your account. Your authored content is anonymised, your agents and
              API keys are revoked, and all organization memberships are removed. You can&apos;t
              delete your account while you&apos;re the sole owner of an organization.
            </p>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-bad-bd bg-surface p-3 text-sm text-bad-fg"
          >
            {error}
          </div>
        ) : null}

        <Button
          type="button"
          variant="danger-secondary"
          disabled={pending}
          onClick={handleDelete}
          className="h-11 self-start px-5 font-bold"
        >
          {pending ? "Deleting account..." : "Delete account"}
        </Button>
      </section>
    </div>
  );
}
