import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { activeProjectIdFor } from "@/lib/project-context";
import { currentTenantIdFor } from "@/lib/tenant-context";

export async function redirectToProjectSettings(
  section: string,
  query: Record<string, string | string[] | undefined> = {},
): Promise<never> {
  const user = await requireUser();
  const tenantId = await currentTenantIdFor(user.id);
  if (!tenantId) redirect("/tenants");
  const projectId = await activeProjectIdFor(prisma, tenantId);
  const project = projectId
    ? await prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { slug: true } })
    : null;
  if (!project) redirect("/tenants");
  const target = new URLSearchParams({ section });
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((item) => target.append(key, item));
    else if (value) target.set(key, value);
  }
  redirect(`/projects/${encodeURIComponent(project.slug)}/settings?${target.toString()}`);
}
