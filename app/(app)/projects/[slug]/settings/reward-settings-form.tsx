"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ProjectRewardRulesSection } from "@/components/project-reward-rules-section";
import { updateProjectAction } from "@/app/(app)/projects/actions";
import type { ProjectActionResult } from "@/app/(app)/projects/actions";
import type { ProjectRewardConfig } from "@/lib/points/project-rewards";

export function RewardSettingsForm({ project }: { project: { slug: string; name: string; goal: string | null; repoUrl: string | null; stagingUrl: string | null; rewardConfig: unknown } }) {
  const [result, action, pending] = useActionState<ProjectActionResult | undefined, FormData>(updateProjectAction, undefined);
  return <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <input type="hidden" name="slug" value={project.slug} />
    <input type="hidden" name="name" value={project.name} />
    <input type="hidden" name="goal" value={project.goal ?? ""} />
    <input type="hidden" name="repoUrl" value={project.repoUrl ?? ""} />
    <input type="hidden" name="stagingUrl" value={project.stagingUrl ?? ""} />
    <ProjectRewardRulesSection initialConfig={project.rewardConfig as ProjectRewardConfig | null} disabled={pending} />
    {result?.error ? <p role="alert" className="text-sm text-red-700">{result.error}</p> : null}
    <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save reward rules"}</Button>
    {result && !result.error ? <p role="status" className="text-sm text-emerald-800">Reward rules saved.</p> : null}
  </form>;
}
