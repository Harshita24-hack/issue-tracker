import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ensureDefaultPlatforms } from "@/lib/categories";
import { CategoryManager } from "@/components/category-manager";
import { AdminIssueTypesManager } from "@/components/admin-issue-types-manager";
import { MilestoneManager } from "@/components/milestone-manager";
import { loadMilestoneSummaries, milestoneScopeFor } from "@/lib/milestone-stats";
import { dueDateValue } from "@/lib/milestones";
import { requireUser } from "@/lib/auth-helpers";
import AgentsSettingsPage from "@/app/(app)/settings/agents/page";
import { ProjectsManager } from "@/app/(app)/projects/projects-manager";

export async function ProjectsSection({ tenantId, error, notice }: { tenantId: string; error?: string | string[]; notice?: string | string[] }) {
  void tenantId;
  return <ProjectsManager searchParams={Promise.resolve({ error, notice })} />;
}

export async function PlatformsSection({ tenantId }: { tenantId: string }) {
  await ensureDefaultPlatforms(tenantId);
  const [rows, usage] = await Promise.all([
    prisma.category.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
    prisma.bug.groupBy({ by: ["categoryId", "isDeleted"], where: { tenantId, categoryId: { not: null } }, _count: { _all: true } }),
  ]);
  const totals = new Map<string, number>(); const deletedCounts: Record<string, number> = {};
  for (const row of usage) { if (!row.categoryId) continue; totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + row._count._all); if (row.isDeleted) deletedCounts[row.categoryId] = row._count._all; }
  return <CategoryManager initialCategories={rows.map((row) => ({ ...row, _count: { bugs: totals.get(row.id) ?? 0 } }))} deletedCounts={deletedCounts} />;
}

export async function TypesSection({ tenantId }: { tenantId: string }) {
  const [types, deletedRows] = await Promise.all([
    prisma.issueType.findMany({ where: { tenantId }, orderBy: { name: "asc" }, include: { _count: { select: { bugs: true } } } }),
    prisma.bug.groupBy({ by: ["typeId"], where: { tenantId, isDeleted: true, typeId: { not: null } }, _count: { _all: true } }),
  ]);
  const deletedCounts = Object.fromEntries(deletedRows.map((row) => [row.typeId as string, row._count._all]));
  return <AdminIssueTypesManager types={types} deletedCounts={deletedCounts} />;
}

export async function MilestonesSection() {
  const user = await requireUser(); const scope = await milestoneScopeFor(user);
  if (!scope.ok) return <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Open an organization first. <Link href="/tenants" className="text-teal-700 underline">Choose an organization</Link>.</div>;
  const milestones = await loadMilestoneSummaries({ tenantId: scope.tenantId });
  return <MilestoneManager milestones={milestones.map((m) => ({ ...m, dueDate: dueDateValue(m.dueDate) || null }))} />;
}

export async function AgentsSection() {
  return AgentsSettingsPage();
}
