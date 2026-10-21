import { redirectToProjectSettings } from "@/lib/project-settings-redirect";

export const metadata = { title: "Milestones" };

export default async function AdminMilestonesPage() {
  await redirectToProjectSettings("milestones");
}
