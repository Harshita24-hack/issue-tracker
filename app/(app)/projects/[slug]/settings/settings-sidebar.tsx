"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type SettingsTab =
  | "general"
  | "platforms"
  | "types"
  | "milestones"
  | "areas"
  | "rewards"
  | "agents"
  | "workflow";

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "general", label: "General" },
  { id: "platforms", label: "Platforms" },
  { id: "types", label: "Types" },
  { id: "milestones", label: "Milestones" },
  { id: "areas", label: "Areas" },
  { id: "rewards", label: "Rewards" },
  { id: "agents", label: "Agents" },
  { id: "workflow", label: "Workflow" },
];

export function ProjectSettingsSidebar({
  projectSlug,
  currentTab,
}: {
  projectSlug: string;
  currentTab: SettingsTab;
}) {
  return (
    <nav
      aria-label="Project settings sections"
      className="flex flex-row gap-1 overflow-x-auto pb-2 md:w-48 md:shrink-0 md:flex-col md:pb-0"
    >
      {tabs.map((tab) => {
        const active = currentTab === tab.id;
        const href =
          tab.id === "general"
            ? `/projects/${encodeURIComponent(projectSlug)}/settings`
            : `/projects/${encodeURIComponent(projectSlug)}/settings?tab=${tab.id}`;
        return (
          <Link
            key={tab.id}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-teal-50 text-teal-900 font-semibold"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
