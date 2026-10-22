"use client";

import { useState } from "react";
import Link from "next/link";
import { copyText } from "@/lib/clipboard";
import { useToast } from "@/components/ui/toast";
import { agentProjectSetupSnippet } from "@/lib/agents/bootstrap-message";

export type ProjectAgentSetupCardProps = {
  projectId: string;
  projectName: string;
  projectSlug?: string | null;
};

/**
 * Prominent agent connection / pairing block at the top of the project issues dashboard (#1254).
 * Gives human project managers a one-click copyable setup snippet to paste directly into their AI agents.
 */
export function ProjectAgentSetupCard({
  projectId,
  projectName,
  projectSlug,
}: ProjectAgentSetupCardProps) {
  const toast = useToast();
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://ziki.dev";
  const snippet = agentProjectSetupSnippet({
    origin,
    projectId,
    projectName,
    projectSlug,
  });

  async function handleCopySnippet() {
    const ok = await copyText(snippet);
    if (ok) {
      toast("Agent setup instructions copied to clipboard.");
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    } else {
      toast("Couldn't copy setup instructions.", "error");
    }
  }

  async function handleCopyProjectId() {
    const ok = await copyText(projectId);
    if (ok) {
      toast("Project ID copied to clipboard.");
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else {
      toast(`Could not copy ID: ${projectId}`, "error");
    }
  }

  return (
    <section
      aria-labelledby="agent-setup-card-heading"
      data-testid="project-agent-setup-card"
      className="rounded-xl border border-teal-200 bg-gradient-to-b from-teal-50/70 to-white p-4 sm:p-5 shadow-xs transition"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-800 text-lg font-semibold shadow-xs"
          >
            🤖
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="agent-setup-card-heading"
                className="text-base font-semibold text-slate-900"
              >
                Connect an Agent to {projectName}
              </h2>
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                Agent Setup
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm">
              Copy this prompt snippet and paste it directly into your AI agent (Claude, Antigravity, Cursor, etc.). It connects the agent to this project and instructs it to ask for your permission before beginning work.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleCopySnippet}
            data-testid="copy-agent-setup-button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            {copiedSnippet ? (
              <>
                <svg className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0z" clipRule="evenodd" />
                </svg>
                <span>Copied!</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Copy for Agent</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse agent snippet" : "Expand agent snippet"}
            data-testid="toggle-snippet-button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          >
            <svg
              className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className="mt-3.5 space-y-3" data-testid="agent-snippet-container">
          <div className="relative">
            <pre className="max-h-52 overflow-y-auto rounded-lg border border-teal-200/80 bg-slate-900 p-3 text-[11px] leading-relaxed font-mono text-teal-100 select-all whitespace-pre-wrap break-all shadow-inner">
              {snippet}
            </pre>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-teal-100 pt-2 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-500">Project ID: <code className="rounded bg-white/80 border border-slate-200 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">{projectId}</code></span>
              <button
                type="button"
                onClick={handleCopyProjectId}
                data-testid="copy-project-id-button"
                className="font-medium text-teal-700 hover:text-teal-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded"
              >
                {copiedId ? "ID Copied!" : "Copy ID"}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 font-medium">
              <Link
                href="/settings/agents/pair"
                className="text-teal-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded"
              >
                Pairing approvals →
              </Link>
              <Link
                href="/llms.txt"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-600 hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded"
              >
                Agent spec (/llms.txt) ↗
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
