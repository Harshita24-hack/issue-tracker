import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { issueTypeScopeFor } from "@/lib/issue-types";
import { projectContextFor } from "@/lib/project-context";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Issue types" };

export default async function AdminTypesPage() {
  const user = await requireUser();
  const scope = await issueTypeScopeFor(user);
  const tenantId = scope.ok ? scope.tenantId : null;
  const context = await projectContextFor(prisma, tenantId);
  const activeProject =
    context.projects.find((p) => p.id === context.activeProjectId) ??
    context.projects[0];
  const slug = activeProject?.slug ?? "default";
  redirect(`/projects/${encodeURIComponent(slug)}/settings?tab=types`);
}
