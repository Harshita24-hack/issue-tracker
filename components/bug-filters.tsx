"use client";

import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { bugPlatforms, severities, statuses } from "@/lib/validations/bug";
import { bugPlatformLabels, severityLabel, statusLabel } from "@/lib/labels";
import {
  BUG_SORT_OPTIONS,
  bugSortLabels,
  parseBugSort,
} from "@/lib/bugs-sort";

const viewLabels: Record<string, string> = {
  mine: "My issues",
  assigned: "Assigned to me",
  created: "Created by me",
  saved: "Saved",
};

const FILTER_KEYS = [
  "q",
  "status",
  "severity",
  "category",
  "platform",
  "view",
  "page",
];

const controlClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700";

function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="w-[calc(50%-0.375rem)] lg:w-32">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={controlClass}
      >
        {children}
      </select>
    </div>
  );
}

export function BugFilters({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function push(next: URLSearchParams) {
    const qs = next.toString();
    router.push(qs ? `/bugs?${qs}` : "/bugs");
  }

  function update(key: string, value: string) {
    if ((params.get(key) ?? "") === value) return;
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete("page");
    push(next);
  }

  function clearFilters() {
    const next = new URLSearchParams(params.toString());
    for (const key of FILTER_KEYS) next.delete(key);
    push(next);
  }

  const activeFilters: { key: string; label: string }[] = [];
  const activeQuery = params.get("q")?.trim();
  const status = params.get("status");
  const severity = params.get("severity");
  const category = params.get("category");
  const platform = params.get("platform");
  const view = params.get("view");

  if (activeQuery) activeFilters.push({ key: "q", label: `Search: ${activeQuery}` });
  if (status && statuses.includes(status as (typeof statuses)[number])) {
    activeFilters.push({
      key: "status",
      label: `Status: ${statusLabel[status as (typeof statuses)[number]]}`,
    });
  }
  if (severity && severities.includes(severity as (typeof severities)[number])) {
    activeFilters.push({
      key: "severity",
      label: `Severity: ${severityLabel[severity as (typeof severities)[number]]}`,
    });
  }
  const categoryName = categories.find((item) => item.id === category)?.name;
  if (categoryName) {
    activeFilters.push({ key: "category", label: `Category: ${categoryName}` });
  }
  if (platform && bugPlatforms.includes(platform as (typeof bugPlatforms)[number])) {
    activeFilters.push({
      key: "platform",
      label: `Platform: ${bugPlatformLabels[platform as (typeof bugPlatforms)[number]]}`,
    });
  }
  if (view && viewLabels[view]) {
    activeFilters.push({ key: "view", label: viewLabels[view] });
  }

  return (
    <section
      aria-label="Search, filter, and sort issues"
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-full lg:min-w-56 lg:flex-1">
          <label htmlFor="q" className="sr-only">
            Search issues
          </label>
          <div className="relative">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              key={params.get("q") ?? ""}
              id="q"
              name="q"
              type="search"
              defaultValue={params.get("q") ?? ""}
              placeholder="Search title or description…"
              className={`${controlClass} pl-9`}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  update("q", event.currentTarget.value.trim());
                }
              }}
              onBlur={(event) => update("q", event.currentTarget.value.trim())}
            />
          </div>
        </div>
        <FilterSelect
          id="status"
          label="Status"
          value={params.get("status") ?? ""}
          onChange={(value) => update("status", value)}
        >
          <option value="">All statuses</option>
          {statuses.map((value) => (
            <option key={value} value={value}>
              {statusLabel[value]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id="severity"
          label="Severity"
          value={params.get("severity") ?? ""}
          onChange={(value) => update("severity", value)}
        >
          <option value="">All severities</option>
          {severities.map((value) => (
            <option key={value} value={value}>
              {severityLabel[value]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id="category"
          label="Category"
          value={params.get("category") ?? ""}
          onChange={(value) => update("category", value)}
        >
          <option value="">All categories</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id="platform"
          label="Platform"
          value={params.get("platform") ?? ""}
          onChange={(value) => update("platform", value)}
        >
          <option value="">All platforms</option>
          {bugPlatforms.map((value) => (
            <option key={value} value={value}>
              {bugPlatformLabels[value]}
            </option>
          ))}
        </FilterSelect>
        <div className="w-[calc(50%-0.375rem)] lg:w-40">
          <label
            htmlFor="sort"
            className="mb-1.5 block text-xs font-semibold text-slate-600"
          >
            Sort by
          </label>
          <select
            id="sort"
            value={parseBugSort(params.get("sort"))}
            onChange={(event) => update("sort", event.target.value)}
            className={controlClass}
          >
            {BUG_SORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {bugSortLabels[option]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {activeFilters.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => update(filter.key, "")}
              aria-label={`Remove ${filter.label} filter`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
            >
              <span className="truncate">{filter.label}</span>
              <span aria-hidden="true" className="text-slate-500">
                ×
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-semibold text-teal-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </section>
  );
}
