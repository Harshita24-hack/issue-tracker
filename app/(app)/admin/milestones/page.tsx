import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { milestoneScopeFor } from "@/lib/milestone-stats";
import { projectContextFor } from "@/lib/project-context";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Milestones" };

export default async function AdminMilestonesPage() {
  const user = await requireUser();
  const scope = await milestoneScopeFor(user);
  const tenantId = scope.ok ? scope.tenantId : null;
  const context = await projectContextFor(prisma, tenantId);
  const activeProject =
    context.projects.find((p) => p.id === context.activeProjectId) ??
    context.projects[0];
  const slug = activeProject?.slug ?? "default";
  redirect(`/projects/${encodeURIComponent(slug)}/settings?tab=milestones`);
}
