import { redirectToProjectSettings } from "@/lib/project-settings-redirect";

export const metadata = { title: "Platforms" };

export default async function AdminCategoriesPage() {
  await redirectToProjectSettings("platforms");
}
