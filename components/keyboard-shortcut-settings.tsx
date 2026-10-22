"use client";

import { useState, useTransition } from "react";
import { setKeyboardShortcutsAction } from "@/app/actions/settings";
import { ShowShortcutsButton } from "@/components/keyboard-shortcuts";

/** Settings → Keyboard shortcuts (#287): the off switch and the cheat sheet. */
export function KeyboardShortcutSettings({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-4 space-y-3">
      <label
        htmlFor="keyboard-shortcuts"
        className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-800"
      >
        <input
          id="keyboard-shortcuts"
          type="checkbox"
          checked={enabled}
          disabled={pending}
          aria-describedby="keyboard-shortcuts-help"
          onChange={(event) => {
            const next = event.target.checked;
            setEnabled(next);
            setFeedback(null);
            startTransition(async () => {
              const result = await setKeyboardShortcutsAction(next);
              if (result.error) {
                setEnabled(!next);
                setFeedback({ kind: "error", text: result.error });
              } else {
                setFeedback({
                  kind: "success",
                  text: next ? "Keyboard shortcuts turned on." : "Keyboard shortcuts turned off.",
                });
              }
            });
          }}
          className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
        />
        Use keyboard shortcuts
      </label>
      <p id="keyboard-shortcuts-help" className="text-sm text-slate-600">
        Press <kbd className="rounded border border-slate-300 bg-slate-50 px-1 font-mono text-xs">?</kbd> anywhere
        to see them. They never fire while you&apos;re typing.
      </p>
      <ShowShortcutsButton />
      <p role="alert" className="text-sm text-red-700 empty:hidden">
        {feedback?.kind === "error" ? feedback.text : ""}
      </p>
      <p role="status" aria-live="polite" className="text-sm text-emerald-700 empty:hidden">
        {feedback?.kind === "success" ? feedback.text : ""}
      </p>
    </div>
  );
}
