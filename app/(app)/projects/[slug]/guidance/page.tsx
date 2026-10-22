import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { isTenantAdmin } from "@/lib/agents/membership";
import { getProjectGuidance, listProjectGuidanceNotes } from "@/lib/agent-api/guidance";
import { MasterGuidanceEditor } from "@/components/project-guidance-editor";
import { GuidanceNotesList } from "@/components/project-guidance-notes-list";

export const metadata = { title: "Project Guidance & Notes" };

export default async function ProjectGuidancePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const tenantId = await currentTenantIdFor(user.id);
  if (!tenantId) redirect("/tenants");

  const { slug } = await params;
  let guidance;
  let notesResult;
  try {
    [guidance, notesResult] = await Promise.all([
      getProjectGuidance(tenantId, slug),
      listProjectGuidanceNotes(tenantId, slug, { status: "all", sort: "top" }),
    ]);
  } catch {
    notFound();
  }

  const isAdmin = await isTenantAdmin(user, tenantId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/projects" className="text-teal-700 hover:underline">
            Projects
          </Link>
          <span>/</span>
          <Link
            href={`/projects/${encodeURIComponent(guidance.projectSlug)}/settings`}
            className="text-teal-700 hover:underline"
          >
            {guidance.projectName}
          </Link>
          <span>/</span>
          <span className="text-slate-900">Guidance</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {guidance.projectName} Guidance & Shared Notes
            </h1>
            <p className="text-sm text-slate-600">
              Master repository for autonomous agents and contributors. Queryable via API; top community notes fold into master guidance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/projects/${encodeURIComponent(guidance.projectSlug)}/settings`}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Project Settings
            </Link>
            <Link
              href="/issues"
              className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 transition"
            >
              View Issues
            </Link>
          </div>
        </div>
      </div>

      {/* Master Guidance Block */}
      <section aria-label="Master Project Guidance">
        <MasterGuidanceEditor
          slug={guidance.projectSlug}
          initialBody={guidance.body}
          isAdmin={isAdmin}
          updatedAt={guidance.updatedAt}
        />
      </section>

      {/* Community / Agent Notes Block */}
      <section aria-label="Community Notes and Learnings">
        <GuidanceNotesList
          slug={guidance.projectSlug}
          initialNotes={notesResult.items}
          isAdmin={isAdmin}
        />
      </section>
    </div>
  );
}
