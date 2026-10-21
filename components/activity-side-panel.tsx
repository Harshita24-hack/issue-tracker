"use client";

import { useEffect, useRef, useState } from "react";
import { ActivityTimeline, type ActivityEntry } from "@/components/activity-timeline";

export type ActivitySidePanelProps = {
  activities: ActivityEntry[];
  totalCount: number;
};

export function ActivitySidePanel({ activities, totalCount }: ActivitySidePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on Escape and focus trap management
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (e.key === "Tab" && panelRef.current) {
        const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Focus the close button when panel opens
  useEffect(() => {
    if (isOpen && panelRef.current) {
      const closeBtn = panelRef.current.querySelector<HTMLButtonElement>('[data-close-button="true"]');
      closeBtn?.focus();
    }
  }, [isOpen]);

  // Prevent background scrolling when open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3.5 w-3.5 text-slate-500"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
            clipRule="evenodd"
          />
        </svg>
        <span>View activity ({totalCount})</span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 transition-opacity animate-in fade-in"
            aria-hidden="true"
            onClick={() => {
              setIsOpen(false);
              triggerRef.current?.focus();
            }}
          />

          {/* Slide-over panel */}
          <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Activity timeline"
              className="w-screen max-w-md bg-white shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6">
                <h2 className="text-base font-semibold text-slate-900">
                  Activity ({totalCount})
                </h2>
                <button
                  ref={(node) => {
                    // node callback if needed
                  }}
                  data-close-button="true"
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                  aria-label="Close activity panel"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <ActivityTimeline
                  activities={activities}
                  totalCount={totalCount}
                  variant="drawer"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
