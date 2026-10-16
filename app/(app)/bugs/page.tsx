import Link from "next/link";
import { Suspense } from "react";
import type { BugPlatform, Prisma, Severity, Status } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import type { AppRole } from "@/lib/roles";
import { BugFilters } from "@/components/bug-filters";
import { BugSidebar } from "@/components/bug-sidebar";
import { BugActionsMenu } from "@/components/bug-actions-menu";
import { VoteButton } from "@/components/vote-button";
import { Badge } from "@/components/ui/badge";
import {
  bugPlatformLabels,
  severityClass,
  severityLabels,
  statusClass,
  statusLabels,
} from "@/lib/labels";
import { LocalTime } from "@/components/local-time";
import { bugPlatforms, severities, statuses } from "@/lib/validations/bug";
import { UserNameWithBadges } from "@/components/user-name-with-badges";
import { getCategoryColor, platformPillClass, severityDotClass } from "@/lib/issue-colors";
import { getIssueTypeBadgeClass } from "@/lib/issue-types";
import { escapeSearchQuery, toSingleQueryParam } from "@/lib/search";
import { calculatePagination } from "@/lib/pagination";
import { PaginationControls } from "@/components/pagination-controls";
import { fetchVoterSummaries } from "@/lib/voter-summaries";
import { createEmptyVoterSummary } from "@/lib/voters";
import { VoterAvatars } from "@/components/voter-avatars";
import {
  bugSortDescriptions,
  getBugOrderBy,
  parseBugSort,
} from "@/lib/bugs-sort";
import { canDeleteTicket } from "@/lib/ticket-deletion";
import { DeleteBugButton } from "@/components/delete-bug-button";
import { RestoreBugButton } from "@/components/restore-bug-button";
import { canBoostTicket } from "@/lib/ticket-boosting";
import { BoostTicketButton } from "@/components/boost-ticket-button";

type SearchParams = Promise<{
  q?: string | string[];
  status?: string | string[];
  severity?: string | string[];
  sort?: string | string[];
  page?: string | string[];
  deleted?: string | string[];
  category?: string | string[];
  platform?: string | string[];
  view?: string | string[];
  [key: string]: string | string[] | undefined;
}>;

const views = ["all", "mine", "assigned", "created", "saved"] as const;

function isStatus(value: string | undefined): value is Status {
  return !!value && (statuses as readonly string[]).includes(value);
}

function isSeverity(value: string | undefined): value is Severity {
  return !!value && (severities as readonly string[]).includes(value);
}

function isPlatform(value: string | undefined): value is BugPlatform {
  return !!value && (bugPlatforms as readonly string[]).includes(value);
}

function isView(value: string | undefined): value is (typeof views)[number] {
  return !!value && (views as readonly string[]).includes(value);
}

function issueWhereForView(
  view: (typeof views)[number],
  userId: string | undefined,
): Prisma.BugWhereInput | undefined {
  if (!userId) return undefined;
  if (view === "mine") {
    return { OR: [{ reporterId: userId }, { assigneeId: userId }] };
  }
  if (view === "assigned") return { assigneeId: userId };
  if (view === "created") return { reporterId: userId };
  if (view === "saved") return { savedBy: { some: { userId } } };
  return undefined;
}

export default async function BugsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  let userId: string | undefined;
  let effectiveRole: AppRole | null | undefined;

  if (session?.user) {
    const user = await requireUser();
    userId = user.id;
    effectiveRole = user.role;
  }

  const canDelete = canDeleteTicket(effectiveRole);
  const canBoost = canBoostTicket(effectiveRole);
  const params = await searchParams;
  const qParam = toSingleQueryParam(params.q);
  const statusParam = toSingleQueryParam(params.status);
  const severityParam = toSingleQueryParam(params.severity);
  const sortParam = toSingleQueryParam(params.sort);
  const pageParam = toSingleQueryParam(params.page);
  const deletedParam = toSingleQueryParam(params.deleted);
  const categoryParam = toSingleQueryParam(params.category);
  const platformParam = toSingleQueryParam(params.platform);
  const viewParam = toSingleQueryParam(params.view);
  const isDeletedView = canDelete && deletedParam === "true";
  const view = isView(viewParam) ? viewParam : "all";
  const platform = isPlatform(platformParam) ? platformParam : undefined;

  const currentSort = parseBugSort(sortParam);
  const where: Prisma.BugWhereInput = {
    isDeleted: isDeletedView,
  };
  const conditions: Prisma.BugWhereInput[] = [];

  if (isStatus(statusParam)) {
    where.status = statusParam;
  }
  if (isSeverity(severityParam)) {
    where.severity = severityParam;
  }
  if (categoryParam) {
    where.categoryId = categoryParam;
  }
  if (platform) {
    where.platform = platform;
  }
  if (qParam?.trim()) {
    const q = escapeSearchQuery(qParam.trim());
    conditions.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  const viewWhere = issueWhereForView(view, userId);
  if (viewWhere) conditions.push(viewWhere);
  if (conditions.length > 0) where.AND = conditions;

  const active = { isDeleted: false };
  const [
    totalCount,
    openCount,
    inProgressCount,
    closedCount,
    mineCount,
    createdCount,
    assignedCount,
    savedCount,
    categoryGroups,
    platformGroups,
    categories,
  ] = await Promise.all([
    prisma.bug.count({ where: active }),
    prisma.bug.count({ where: { ...active, status: "open" } }),
    prisma.bug.count({ where: { ...active, status: "in_progress" } }),
    prisma.bug.count({
      where: { ...active, status: { in: ["resolved", "closed"] } },
    }),
    userId
      ? prisma.bug.count({
          where: {
            ...active,
            OR: [{ reporterId: userId }, { assigneeId: userId }],
          },
        })
      : 0,
    userId
      ? prisma.bug.count({ where: { ...active, reporterId: userId } })
      : 0,
    userId
      ? prisma.bug.count({ where: { ...active, assigneeId: userId } })
      : 0,
    userId
      ? prisma.bug.count({
          where: { ...active, savedBy: { some: { userId } } },
        })
      : 0,
    prisma.bug.groupBy({
      by: ["categoryId"],
      where: { ...active, categoryId: { not: null } },
      _count: { _all: true },
    }),
    prisma.bug.groupBy({
      by: ["platform"],
      where: { ...active, platform: { not: null } },
      _count: { _all: true },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const categoryCounts = new Map(
    categoryGroups.map((group) => [group.categoryId, group._count._all]),
  );
  const platformCounts: Partial<Record<BugPlatform, number>> = {};
  for (const group of platformGroups) {
    if (group.platform) platformCounts[group.platform] = group._count._all;
  }
  const sidebarCategories = categories.map((item) => ({
    ...item,
    count: categoryCounts.get(item.id) ?? 0,
  }));

  const filteredCount = await prisma.bug.count({ where });
  const pagination = calculatePagination({
    page: pageParam,
    totalCount: filteredCount,
  });

  const bugs = await prisma.bug.findMany({
    where,
    include: {
      type: { select: { name: true } },
      reporter: { select: { name: true, role: true } },
      assignee: { select: { name: true, role: true } },
      category: { select: { id: true, name: true } },
      votes: userId
        ? { where: { userId }, select: { id: true, value: true }, take: 1 }
        : false,
      savedBy: userId
        ? { where: { userId }, select: { userId: true }, take: 1 }
        : false,
      _count: { select: { comments: true } },
    },
    orderBy: getBugOrderBy(currentSort),
    skip: pagination.skip,
    take: pagination.take,
  });

  const bugIds = bugs.map((bug) => bug.id);
  const voterSummaries = await fetchVoterSummaries(bugIds);

  return (
    <div className="flex min-w-0 flex-col gap-5 xl:-mx-32 lg:flex-row lg:gap-6">
      <BugSidebar
        counts={{
          all: totalCount,
          mine: mineCount,
          assigned: assignedCount,
          created: createdCount,
          saved: savedCount,
          platforms: platformCounts,
        }}
        categories={sidebarCategories}
        view={view}
        categoryId={categoryParam}
        platform={platform}
      />
      <section className="min-w-0 flex-1 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
              {isDeletedView ? "Deleted Issues" : "Issues"}
            </h1>
            {isDeletedView ? (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                Admin view
              </span>
            ) : null}
          </div>
          <p className="text-sm text-slate-600">
            {filteredCount} result{filteredCount === 1 ? "" : "s"} · sorted by{" "}
            {bugSortDescriptions[currentSort]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canDelete ? (
            <Link
              href={isDeletedView ? "/bugs" : "/bugs?deleted=true"}
              className={`inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium border transition ${
                isDeletedView
                  ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              {isDeletedView ? "← View active issues" : "View deleted issues"}
            </Link>
          ) : null}
          {!isDeletedView ? (
            <Link
              href="/bugs/new"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
            >
              <span aria-hidden="true" className="text-base leading-none">+</span>
              New issue
            </Link>
          ) : null}
        </div>
      </div>

      <section
        aria-label="Issue status summary"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-sm sm:grid-cols-4"
      >
        {[
          {
            label: "Total issues",
            count: totalCount,
            tile: "bg-sky-50 text-sky-700",
            bar: "bg-sky-500",
            icon: "M7 3h7l4 4v14H7zM14 3v5h5M10 13h5M10 17h5",
          },
          {
            label: "Open",
            count: openCount,
            tile: "bg-emerald-50 text-emerald-700",
            bar: "bg-emerald-500",
            icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 12.5l2.5 2.5 4.5-5",
          },
          {
            label: "In progress",
            count: inProgressCount,
            tile: "bg-violet-50 text-violet-700",
            bar: "bg-violet-500",
            icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
          },
          {
            label: "Closed",
            count: closedCount,
            tile: "bg-slate-100 text-slate-600",
            bar: "bg-slate-400",
            icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9 12l2 2 4-4",
          },
        ].map((stat, index) => (
          <div key={stat.label} className="flex items-center gap-3 bg-white px-4 py-4">
            <span
              aria-hidden="true"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.tile}`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d={stat.icon} />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-semibold leading-none tabular-nums text-slate-950">
                {stat.count}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">{stat.label}</p>
              <div
                aria-hidden="true"
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
              >
                <div
                  className={`h-full rounded-full ${stat.bar}`}
                  style={{
                    width: `${
                      index === 0 || totalCount === 0
                        ? index === 0 && totalCount > 0
                          ? 100
                          : 0
                        : Math.round((stat.count / totalCount) * 100)
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </section>

      <Suspense
        fallback={<div className="h-36 animate-pulse rounded-xl bg-slate-100" />}
      >
        <BugFilters categories={categories} />
      </Suspense>

      {bugs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="font-medium text-slate-800">No issues match these filters.</p>
          <p className="mt-1 text-sm text-slate-600">
            Try clearing filters or report a new issue.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/bugs"
              className="text-sm font-medium text-teal-700 hover:underline"
            >
              Clear filters
            </Link>
            <Link
              href="/bugs/new"
              className="inline-flex items-center justify-center rounded-lg bg-teal-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              New issue
            </Link>
          </div>
        </div>
      ) : (
        <>
          <ul className="space-y-2.5">
          {bugs.map((bug) => {
            const userVote =
              Array.isArray(bug.votes) && bug.votes.length > 0
                ? (bug.votes[0].value ?? 1)
                : 0;
            const voterSummary =
              voterSummaries.get(bug.id) ?? createEmptyVoterSummary();
            return (
              <li
                key={bug.id}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3.5 shadow-sm transition hover:border-slate-300 hover:shadow-md sm:px-4 sm:py-4"
              >
                <VoteButton
                  bugId={bug.id}
                  voteCount={bug.voteCount}
                  userVote={userVote}
                  likeCount={voterSummary.likes.count}
                  dislikeCount={voterSummary.dislikes.count}
                  size="sm"
                />
                <Link
                  href={`/bugs/${bug.id}`}
                  className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <p className="line-clamp-2 break-words text-[15px] font-semibold leading-snug text-slate-900">
                        {bug.title}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-slate-500">
                        <span className="font-mono text-slate-400">
                          #{bug.id.slice(-6)}
                        </span>
                        <span>·</span>
                        <span>Reported by</span>
                        <UserNameWithBadges
                          name={bug.reporter.name}
                          role={bug.reporter.role}
                        />
                        <span>·</span>
                        {bug.assignee ? (
                          <>
                            <span>Assigned to</span>
                            <UserNameWithBadges
                              name={bug.assignee.name}
                              role={bug.assignee.role}
                            />
                          </>
                        ) : (
                          <span>Unassigned</span>
                        )}
                        <span>· <LocalTime date={bug.updatedAt} /></span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5 self-start xl:self-center">
                      {bug.isDeleted ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-900">
                          🗑️ Deleted
                        </span>
                      ) : null}
                      {bug.isBoosted && !bug.isDeleted ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                          <span aria-hidden="true">⚡</span> Boosted
                        </span>
                      ) : null}
                      {bug.type ? (
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getIssueTypeBadgeClass(
                            bug.type.name,
                          )}`}
                        >
                          {bug.type.name}
                        </span>
                      ) : null}
                      {bug.category ? (
                        <Badge
                          className={getCategoryColor(bug.category.name).pill}
                        >
                          {bug.category.name}
                        </Badge>
                      ) : null}
                      {bug.platform ? (
                        <Badge className={platformPillClass[bug.platform]}>
                          {bugPlatformLabels[bug.platform]}
                        </Badge>
                      ) : null}
                      <Badge className={severityClass[bug.severity]}>
                        <span
                          aria-hidden="true"
                          className={`mr-1.5 h-1.5 w-1.5 rounded-full ${severityDotClass[bug.severity]}`}
                        />
                        {severityLabels[bug.severity]}
                      </Badge>
                      <Badge className={statusClass[bug.status]}>
                        {statusLabels[bug.status]}
                      </Badge>
                      {voterSummary.likes.count > 0 ? (
                        <span className="ml-1 hidden items-center sm:inline-flex">
                          <VoterAvatars
                            voters={voterSummary.likes.voters}
                            totalCount={voterSummary.likes.count}
                            size="sm"
                          />
                        </span>
                      ) : null}
                      <span
                        className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500"
                        title={`${bug._count.comments} comment${bug._count.comments === 1 ? "" : "s"}`}
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
                        </svg>
                        {bug._count.comments}
                        <span className="sr-only"> comments</span>
                      </span>
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"
                        title={`${bug.proofLinks.length} proof link${bug.proofLinks.length === 1 ? "" : "s"}`}
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3.5 3.5 0 0 1 5 5l-8.6 8.6a2 2 0 0 1-3-3L15 8" />
                        </svg>
                        {bug.proofLinks.length}
                        <span className="sr-only"> proof links</span>
                      </span>
                    </div>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-1 self-center pl-1">
                  {userId ? (
                    <BugActionsMenu
                      bugId={bug.id}
                      initiallySaved={
                        Array.isArray(bug.savedBy) && bug.savedBy.length > 0
                      }
                    />
                  ) : null}
                </div>
                {canBoost || canDelete ? (
                  <div className="flex shrink-0 items-center gap-1 self-center pl-1">
                    {canBoost && !bug.isDeleted ? (
                      <BoostTicketButton
                        bugId={bug.id}
                        isBoosted={bug.isBoosted}
                        variant="ghost"
                        size="sm"
                      />
                    ) : null}
                    {canDelete ? (
                      bug.isDeleted ? (
                        <RestoreBugButton
                          bugId={bug.id}
                          bugTitle={bug.title}
                          variant="ghost"
                          size="sm"
                          label="Restore"
                          className="text-teal-700 hover:text-teal-900 hover:bg-teal-50"
                        />
                      ) : (
                        <DeleteBugButton
                          bugId={bug.id}
                          bugTitle={bug.title}
                          variant="ghost"
                          size="sm"
                          label="Delete"
                          className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                        />
                      )
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalCount={filteredCount}
          from={pagination.from}
          to={pagination.to}
          queryParams={{
            ...(statusParam ? { status: statusParam } : {}),
            ...(severityParam ? { severity: severityParam } : {}),
            ...(categoryParam ? { category: categoryParam } : {}),
            ...(platformParam ? { platform: platformParam } : {}),
            ...(viewParam ? { view: viewParam } : {}),
            ...(qParam ? { q: qParam } : {}),
            ...(isDeletedView ? { deleted: "true" } : {}),
            sort: sortParam,
          }}
        />
        </>
      )}
      </section>
    </div>
  );
}
