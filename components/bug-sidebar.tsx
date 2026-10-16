import Link from "next/link";
import type { BugPlatform } from "@prisma/client";
import { bugPlatformLabels } from "@/lib/labels";

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
  {
    key: "saved",
    label: "Saved",
    href: "/bugs?view=saved",
    countKey: "saved",
  },
] as const;

function SidebarGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-max lg:min-w-0">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h2>
      <div className="flex gap-1 lg:block">{children}</div>
    </section>
  );
}

function SidebarLink({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 ${
        active
          ? "bg-teal-50 font-semibold text-teal-900"
          : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
      }`}
    >
      <span>{label}</span>
      <span className="text-xs tabular-nums text-slate-500">{count}</span>
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
  return (
    <aside
      aria-label="Issue navigation"
      className="min-w-0 border-b border-slate-200 pb-3 lg:w-52 lg:shrink-0 lg:border-b-0 lg:pb-0"
    >
      <div className="flex gap-6 overflow-x-auto lg:sticky lg:top-6 lg:block lg:space-y-6 lg:overflow-visible">
        <SidebarGroup title="Workspace">
          {views.map((item) => (
            <SidebarLink
              key={item.key}
              href={item.href}
              label={item.label}
              count={counts[item.countKey]}
              active={item.key === view && !categoryId && !platform}
            />
          ))}
        </SidebarGroup>
        {categories.length > 0 ? (
          <SidebarGroup title="Category">
            {categories.map((item) => (
              <SidebarLink
                key={item.id}
                href={`/bugs?category=${item.id}`}
                label={item.name}
                count={item.count}
                active={categoryId === item.id}
              />
            ))}
          </SidebarGroup>
        ) : null}
        <SidebarGroup title="Platform">
          {(Object.keys(bugPlatformLabels) as BugPlatform[]).map((value) => (
            <SidebarLink
              key={value}
              href={`/bugs?platform=${value}`}
              label={bugPlatformLabels[value]}
              count={counts.platforms[value] ?? 0}
              active={platform === value}
            />
          ))}
        </SidebarGroup>
      </div>
    </aside>
  );
}
