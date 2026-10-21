import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { platformScopeFor } from "@/lib/categories";
import { projectContextFor } from "@/lib/project-context";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Platforms" };

export default async function AdminCategoriesPage() {
  const user = await requireUser();
  const scope = await platformScopeFor(user);
  const tenantId = scope.ok ? scope.tenantId : null;
  const context = await projectContextFor(prisma, tenantId);
  const activeProject =
    context.projects.find((p) => p.id === context.activeProjectId) ??
    context.projects[0];
  const slug = activeProject?.slug ?? "default";
  redirect(`/projects/${encodeURIComponent(slug)}/settings?tab=platforms`);
}
