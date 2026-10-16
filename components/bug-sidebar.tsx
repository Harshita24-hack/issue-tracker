import Link from "next/link";
import type { ReactNode } from "react";
import type { BugPlatform } from "@prisma/client";
import { bugPlatformLabels } from "@/lib/labels";
import { getCategoryColor } from "@/lib/issue-colors";

type BugSidebarProps = {
  counts: {
    all: number;
    mine: number;
    assigned: number;
    created: number;
    saved: number;
    platforms: Partial<Record<BugPlatform, number>>;
  };
  categories: { id: string; name: string; count: number }[];
  view: string;
  categoryId?: string;
  platform?: BugPlatform;
};

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      {children}
    </svg>
  );
}

const icons = {
  all: (
    <Icon>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </Icon>
  ),
  mine: (
    <Icon>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Icon>
  ),
  assigned: (
    <Icon>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 8l2 2 3-3.5" />
    </Icon>
  ),
  created: (
    <Icon>
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
  ),
  saved: (
    <Icon>
      <path d="M6 3h12v18l-6-4-6 4Z" />
    </Icon>
  ),
  web: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </Icon>
  ),
  mobile: (
    <Icon>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </Icon>
  ),
  desktop: (
    <Icon>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </Icon>
  ),
  api_backend: (
    <Icon>
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path d="M7 7h.01M7 17h.01" />
    </Icon>
  ),
} as const;

const views = [
  { key: "all", label: "All issues", href: "/bugs", countKey: "all" },
  { key: "mine", label: "My issues", href: "/bugs?view=mine", countKey: "mine" },
  {
    key: "assigned",
    label: "Assigned to me",
    href: "/bugs?view=assigned",
    countKey: "assigned",
  },
  {
    key: "created",
    label: "Created by me",
    href: "/bugs?view=created",
    countKey: "created",
  },
  { key: "saved", label: "Saved", href: "/bugs?view=saved", countKey: "saved" },
] as const;

function SidebarGroup({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="shrink-0 lg:shrink">
      {title ? (
        <h2 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </h2>
      ) : null}
      <div className="flex gap-1 lg:block lg:space-y-0.5">{children}</div>
    </section>
  );
}

function SidebarLink({
  href,
  label,
  count,
  active,
  leading,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
  leading: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 ${
        active
          ? "bg-teal-50 font-semibold text-teal-900"
          : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
      }`}
    >
      <span className={active ? "text-teal-800" : "text-slate-500"}>{leading}</span>
      <span className="flex-1">{label}</span>
      <span
        className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs tabular-nums ${
          active ? "bg-teal-100 text-teal-900" : "bg-slate-100 text-slate-600"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}

export function BugSidebar({
  counts,
  categories,
  view,
  categoryId,
  platform,
}: BugSidebarProps) {
  const filtered = Boolean(categoryId || platform);
  const categoryTotal = categories.reduce((sum, item) => sum + item.count, 0);
  const platformTotal = Object.values(counts.platforms).reduce(
    (sum, value) => sum + (value ?? 0),
    0,
  );

  return (
    <aside
      aria-label="Issue navigation"
      className="min-w-0 border-b border-slate-200 pb-3 lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4"
    >
      <div className="flex gap-6 overflow-x-auto lg:sticky lg:top-6 lg:block lg:space-y-5 lg:overflow-visible">
        <SidebarGroup>
          {views.map((item) => (
            <SidebarLink
              key={item.key}
              href={item.href}
              label={item.label}
              count={counts[item.countKey]}
              active={item.key === view && !filtered}
              leading={icons[item.key]}
            />
          ))}
        </SidebarGroup>
        {categories.length > 0 ? (
          <SidebarGroup title="Categories">
            <SidebarLink
              href="/bugs"
              label="All categories"
              count={categoryTotal}
              active={false}
              leading={
                <span className="block h-2.5 w-2.5 rounded-full bg-blue-600" />
              }
            />
            {categories.map((item) => (
              <SidebarLink
                key={item.id}
                href={`/bugs?category=${item.id}`}
                label={item.name}
                count={item.count}
                active={categoryId === item.id}
                leading={
                  <span
                    className={`block h-2.5 w-2.5 rounded-full ${getCategoryColor(item.name).dot}`}
                  />
                }
              />
            ))}
          </SidebarGroup>
        ) : null}
        <SidebarGroup title="Platforms">
          <SidebarLink
            href="/bugs"
            label="All platforms"
            count={platformTotal}
            active={false}
            leading={icons.web}
          />
          {(Object.keys(bugPlatformLabels) as BugPlatform[]).map((value) => (
            <SidebarLink
              key={value}
              href={`/bugs?platform=${value}`}
              label={bugPlatformLabels[value]}
              count={counts.platforms[value] ?? 0}
              active={platform === value}
              leading={icons[value]}
            />
          ))}
        </SidebarGroup>
      </div>
    </aside>
  );
}
