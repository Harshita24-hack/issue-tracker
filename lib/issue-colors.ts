import type { BugPlatform } from "@prisma/client";

type CategoryColor = { dot: string; pill: string };

const CATEGORY_PALETTE: CategoryColor[] = [
  { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-800" },
  { dot: "bg-rose-500", pill: "bg-rose-50 text-rose-800" },
  { dot: "bg-violet-500", pill: "bg-violet-50 text-violet-800" },
  { dot: "bg-amber-500", pill: "bg-amber-50 text-amber-800" },
  { dot: "bg-sky-500", pill: "bg-sky-50 text-sky-800" },
  { dot: "bg-fuchsia-500", pill: "bg-fuchsia-50 text-fuchsia-800" },
  { dot: "bg-teal-500", pill: "bg-teal-50 text-teal-800" },
  { dot: "bg-slate-500", pill: "bg-slate-100 text-slate-700" },
];

/** Stable color per category name so a category looks the same everywhere. */
export function getCategoryColor(name: string): CategoryColor {
  let hash = 0;
  for (const char of name.toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

export const platformPillClass: Record<BugPlatform, string> = {
  web: "bg-sky-50 text-sky-800",
  mobile: "bg-violet-50 text-violet-800",
  desktop: "bg-slate-100 text-slate-700",
  api_backend: "bg-amber-50 text-amber-800",
};

export const severityDotClass = {
  low: "bg-slate-400",
  medium: "bg-orange-500",
  high: "bg-red-500",
  critical: "bg-red-700",
} as const;
