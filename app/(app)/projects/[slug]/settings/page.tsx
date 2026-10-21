import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { isTenantAdmin, isTenantAdminRole } from "@/lib/agents/membership";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { ProjectSettingsForm } from "./settings-form";
import { ProjectAreasManager } from "./areas-manager";
import { ProjectApprovalRulesSection } from "./approval-rules";
import { WorkflowSettingsForm } from "./workflow-settings-form";
import { workflowValues } from "@/lib/workflow-config";
import { ProjectSettingsSidebar, type SettingsTab } from "./settings-sidebar";
import { ProjectRewardsSettingsForm } from "./rewards-form";
import { ProjectAgentsSection } from "./agents-section";
import { CategoryManager } from "@/components/category-manager";
import { AdminIssueTypesManager } from "@/components/admin-issue-types-manager";
import { MilestoneManager } from "@/components/milestone-manager";
import { ensureDefaultPlatforms } from "@/lib/categories";
import { ensureDefaultIssueTypes } from "@/lib/issue-types";
import { loadMilestoneSummaries } from "@/lib/milestone-stats";
import { dueDateValue } from "@/lib/milestones";
import { projectContextFor } from "@/lib/project-context";
import { ensureDefaultProjectKey } from "@/lib/agents/default-key";
import { materializeApprovedPairings } from "@/lib/agents/pairing";
import { deleteProjectAction, setProjectArchivedAction } from "@/app/(app)/projects/actions";

export const metadata = { title: "Project settings" };

export default async function ProjectSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ github?: string; tab?: string }>;
}) {
  const user = await requireUser();
  const tenantId = await currentTenantIdFor(user.id);
  if (!tenantId) redirect("/tenants");
  if (!(await isTenantAdmin(user, tenantId))) notFound();
  const { slug } = await params;
  const { github, tab: rawTab } = await searchParams;

  const validTabs: SettingsTab[] = [
    "general",
    "platforms",
    "types",
    "milestones",
    "areas",
    "rewards",
    "agents",
    "workflow",
  ];
  const activeTab: SettingsTab = validTabs.includes(rawTab as SettingsTab)
    ? (rawTab as SettingsTab)
    : "general";

  const project = await prisma.project.findFirst({
    where: { tenantId, slug },
    select: {
      id: true,
      slug: true,
      name: true,
      goal: true,
      repoUrl: true,
      stagingUrl: true,
      githubInstallationId: true,
      rewardConfig: true,
      workflow: true,
      archivedAt: true,
      _count: { select: { bugs: true } },
    },
  });
  if (!project) notFound();

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    select: { role: true },
  });
  const isOwner = membership?.role === "owner";
  const isAdmin = isTenantAdminRole(membership?.role, user.role);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <Link href="/projects" className="text-sm text-teal-700 hover:underline">
          ← Projects
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">{project.name} settings</h1>
        <p className="text-sm text-slate-600">
          Manage your project, platforms, types, milestones, rewards, agents, and workflow.
        </p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <ProjectSettingsSidebar projectSlug={project.slug} currentTab={activeTab} />

        <div className="min-w-0 flex-1 space-y-6">
          {activeTab === "general" && (
            <div className="space-y-6">
              {github === "error" ? (
                <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  GitHub setup could not be completed. Start the connection again from this page.
                </p>
              ) : null}
              {github === "connected" ? (
                <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                  GitHub App installation connected.
                </p>
              ) : null}
              {github === "unavailable" ? (
                <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  The GitHub App is not configured. Set GITHUB_APP_SLUG before connecting it.
                </p>
              ) : null}

              <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
                <ProjectSettingsForm project={project} showRewards={false} />
                <div className="border-t border-slate-200 pt-5">
                  <h2 className="text-base font-semibold text-slate-900">GitHub App</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Installation ID: {project.githubInstallationId ?? "Not connected"}. No access
                    token is stored.
                  </p>
                  <form
                    action={`/projects/${encodeURIComponent(project.slug)}/settings/github`}
                    method="get"
                    className="mt-3"
                  >
                    <Button type="submit">
                      {project.githubInstallationId
                        ? "Change installation"
                        : "Connect GitHub App"}
                    </Button>
                  </form>
                </div>
              </section>

              {isOwner ? (
                <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
                  <h2 className="text-base font-semibold text-slate-900">Archive or delete</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Archived projects cannot be edited or selected. Deleting is permanent and only allowed when there are no issues.
                  </p>
                  <div className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <form action={setProjectArchivedAction}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input
                        type="hidden"
                        name="archived"
                        value={project.archivedAt ? "false" : "true"}
                      />
                      <Button type="submit" variant="secondary">
                        {project.archivedAt ? "Restore project" : "Archive project"}
                      </Button>
                    </form>

                    <form action={deleteProjectAction} className="space-y-2 border-t border-slate-200 pt-4">
                      <input type="hidden" name="projectId" value={project.id} />
                      <p className="text-sm font-medium text-slate-800">Delete project</p>
                      <p className="text-xs text-slate-600">
                        Only works when the project has no issues ({project._count.bugs} issue
                        {project._count.bugs === 1 ? "" : "s"} currently).
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          name="confirmName"
                          placeholder={`Type ${project.name}`}
                          autoComplete="off"
                          required
                          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900"
                        />
                        <Button type="submit" variant="danger-secondary">
                          Delete project
                        </Button>
                      </div>
                    </form>
                  </div>
                </section>
              ) : null}
            </div>
          )}

          {activeTab === "platforms" && (
            <PlatformSettingsTab tenantId={tenantId} />
          )}

          {activeTab === "types" && (
            <TypesSettingsTab tenantId={tenantId} />
          )}

          {activeTab === "milestones" && (
            <MilestonesSettingsTab tenantId={tenantId} />
          )}

          {activeTab === "areas" && (
            <AreasSettingsTab projectId={project.id} projectSlug={project.slug} />
          )}

          {activeTab === "rewards" && (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Reward & Points Rules</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Custom reward bounties for solvers, reporters, and reviewers in this project.
                </p>
              </div>
              <ProjectRewardsSettingsForm project={project} />
            </section>
          )}

          {activeTab === "agents" && (
            <AgentsSettingsTab
              user={user}
              tenantId={tenantId}
              isAdmin={isAdmin}
              projectId={project.id}
            />
          )}

          {activeTab === "workflow" && (
            <WorkflowSettingsTab
              project={project}
              tenantId={tenantId}
            />
          )}
        </div>
      </div>

      <Link href="/issues" className="inline-block text-sm text-teal-700 hover:underline">
        Back to issues
      </Link>
    </div>
  );
}

async function PlatformSettingsTab({ tenantId }: { tenantId: string }) {
  await ensureDefaultPlatforms(tenantId);
  const [rows, usage] = await Promise.all([
    prisma.category.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    }),
    prisma.bug.groupBy({
      by: ["categoryId", "isDeleted"],
      where: { tenantId, categoryId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const totals = new Map<string, number>();
  const deletedCounts: Record<string, number> = {};
  for (const row of usage) {
    if (!row.categoryId) continue;
    totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + row._count._all);
    if (row.isDeleted) deletedCounts[row.categoryId] = row._count._all;
  }

  const initialCategories = rows.map((cat) => ({
    ...cat,
    _count: { bugs: totals.get(cat.id) ?? 0 },
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Platforms</h2>
        <p className="text-sm text-slate-600">
          The surfaces where bugs happen (Web, iOS, Android, etc.).
        </p>
      </div>
      <CategoryManager initialCategories={initialCategories} deletedCounts={deletedCounts} />
    </div>
  );
}

async function TypesSettingsTab({ tenantId }: { tenantId: string }) {
  await ensureDefaultIssueTypes(tenantId);
  const [types, deletedRows] = await Promise.all([
    prisma.issueType.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { bugs: true } },
      },
    }),
    prisma.bug.groupBy({
      by: ["typeId"],
      where: { tenantId, isDeleted: true, typeId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const deletedCounts = Object.fromEntries(
    deletedRows.map((row) => [row.typeId as string, row._count._all]),
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Issue types</h2>
        <p className="text-sm text-slate-600">
          Kinds of work your team tracks (Bug, Feature, Task, etc.).
        </p>
      </div>
      <AdminIssueTypesManager types={types} deletedCounts={deletedCounts} />
    </div>
  );
}

async function MilestonesSettingsTab({ tenantId }: { tenantId: string }) {
  const milestones = await loadMilestoneSummaries({ tenantId });
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Milestones</h2>
        <p className="text-sm text-slate-600">
          Group issues into a release or sprint.
        </p>
      </div>
      <MilestoneManager
        milestones={milestones.map((m) => ({ ...m, dueDate: dueDateValue(m.dueDate) || null }))}
      />
    </div>
  );
}

async function AreasSettingsTab({
  projectId,
  projectSlug,
}: {
  projectId: string;
  projectSlug: string;
}) {
  const areas = await prisma.projectArea.findMany({
    where: { projectId },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, slug: true, description: true, paths: true },
  });
  return <ProjectAreasManager projectSlug={projectSlug} areas={areas} />;
}

async function AgentsSettingsTab({
  user,
  tenantId,
  isAdmin,
  projectId,
}: {
  user: { id: string; role: string };
  tenantId: string;
  isAdmin: boolean;
  projectId: string;
}) {
  const context = await projectContextFor(prisma, tenantId);
  try {
    await ensureDefaultProjectKey({
      userId: user.id,
      tenantId,
      projectId,
    });
  } catch (error) {
    console.error("[agents] default agent key failed", error);
  }
  try {
    await materializeApprovedPairings(user.id, tenantId);
  } catch (error) {
    console.error("[agents] approved agents were not listed", error);
  }

  const [mine, members, areas] = await Promise.all([
    prisma.agent.findMany({
      where: { ownerUserId: user.id, tenantId },
      orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        model: true,
        level: true,
        burst: true,
        burstUntil: true,
        createdAt: true,
        revokedAt: true,
        defaultProjectId: true,
        apiKeys: {
          where: { revokedAt: null },
          select: {
            id: true,
            prefix: true,
            sealedKey: true,
            lastUsedAt: true,
            project: { select: { id: true, name: true } },
          },
        },
        areaPreferences: { select: { projectAreaId: true, projectArea: { select: { projectId: true } } } },
      },
    }),
    prisma.membership.findMany({
      where: { tenantId },
      orderBy: { user: { name: "asc" } },
      select: {
        role: true,
        user: {
          select: {
            id: true,
            name: true,
            agents: {
              where: { tenantId, revokedAt: null },
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                name: true,
                model: true,
                level: true,
                burst: true,
                burstUntil: true,
                areaPreferences: { select: { projectAreaId: true, projectArea: { select: { projectId: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.projectArea.findMany({
      where: { projectId: { in: context.projects.map((p) => p.id) } },
      orderBy: [{ projectId: "asc" }, { name: "asc" }],
      select: { id: true, name: true, projectId: true },
    }),
  ]);

  return (
    <ProjectAgentsSection
      userId={user.id}
      isAdmin={isAdmin}
      projects={context.projects}
      activeProjectId={projectId}
      mine={mine}
      members={members}
      areas={areas}
    />
  );
}

async function WorkflowSettingsTab({
  project,
  tenantId,
}: {
  project: { id: string; slug: string; workflow: Parameters<typeof workflowValues>[0] };
  tenantId: string;
}) {
  const workflow = workflowValues(project.workflow);
  const [issueTypes, approvalRules] = await Promise.all([
    prisma.issueType.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.approvalRule.findMany({
      where: {
        projectId: project.id,
        OR: [{ issueTypeId: null }, { issueType: { tenantId } }],
      },
      include: { issueType: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="workflow-heading">
        <div>
          <h2 id="workflow-heading" className="text-base font-semibold text-slate-900">Workflow</h2>
          <p className="mt-1 text-sm text-slate-600">
            The gates agents work under in this project. Changes are audited.
          </p>
        </div>
        <WorkflowSettingsForm slug={project.slug} workflow={workflow} />
      </section>
      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <ProjectApprovalRulesSection
          projectId={project.id}
          slug={project.slug}
          rules={approvalRules}
          issueTypes={issueTypes}
        />
      </section>
    </div>
  );
}
