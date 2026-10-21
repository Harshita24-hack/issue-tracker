"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FOCUSABLE, wrapFocusIndex } from "@/lib/focus-trap";
import { ActivityTimeline, type ActivityEntry } from "@/components/activity-timeline";

export function IssueActivityPanel({
  activities,
  totalCount,
}: {
  activities: ActivityEntry[];
  totalCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const count = totalCount ?? activities.length;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    if (!panel) return;

    // Prevent body scroll when the panel is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first interactive element inside the panel, or the panel itself
    const focusableElements = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    const firstFocusable = focusableElements[0];
    if (firstFocusable) {
      firstFocusable.focus();
    } else {
      panel.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key === "Tab") {
        const stops = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (stops.length === 0) {
          event.preventDefault();
          return;
        }
        const index = stops.indexOf(document.activeElement as HTMLElement);
        const next = wrapFocusIndex(index, stops.length, event.shiftKey);
        if (next !== null) {
          event.preventDefault();
          stops[next]?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
      >
        <svg
          className="h-3.5 w-3.5 text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
        <span>View activity ({count})</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
            aria-hidden="true"
          />

          <div className="fixed inset-y-0 right-0 flex max-w-full pl-0 sm:pl-10">
            <div
              ref={panelRef}
              tabIndex={-1}
              className="flex w-screen max-w-full flex-col bg-white shadow-xl focus:outline-none sm:max-w-md md:max-w-lg"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
                <h2 id={titleId} className="text-base font-semibold text-slate-900">
                  Activity ({count})
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                  aria-label="Close activity panel"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18 18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <ActivityTimeline
                  activities={activities}
                  totalCount={totalCount}
                  showHeader={false}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
