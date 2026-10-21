import { redirectToProjectSettings } from "@/lib/project-settings-redirect";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }> }) {
  await redirectToProjectSettings("projects", await searchParams);
}
