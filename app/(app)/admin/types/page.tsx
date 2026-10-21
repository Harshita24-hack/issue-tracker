import { redirectToProjectSettings } from "@/lib/project-settings-redirect";

export const metadata = { title: "Issue types" };

export default async function AdminTypesPage() {
  await redirectToProjectSettings("types");
}
