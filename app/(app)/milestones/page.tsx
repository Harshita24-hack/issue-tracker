import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { projectContextFor } from "@/lib/project-context";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Milestones" };

export default async function MilestonesPage() {
  const user = await requireUser();
  const tenantId = await currentTenantIdFor(user.id);
  const context = await projectContextFor(prisma, tenantId);
  const activeProject =
    context.projects.find((p) => p.id === context.activeProjectId) ??
    context.projects[0];
  const slug = activeProject?.slug ?? "default";
  redirect(`/projects/${encodeURIComponent(slug)}/settings?tab=milestones`);
}
