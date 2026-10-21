"use client";

import { useActionState } from "react";
import { updateProjectAction } from "@/app/(app)/projects/actions";
import type { ProjectActionResult } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { ProjectRewardRulesSection } from "@/components/project-reward-rules-section";
import type { ProjectRewardConfig } from "@/lib/points/project-rewards";

type Project = {
  slug: string;
  name: string;
  goal: string | null;
  repoUrl: string | null;
  stagingUrl: string | null;
  rewardConfig?: unknown;
};

export function ProjectRewardsSettingsForm({ project }: { project: Project }) {
  const [result, action, pending] = useActionState<ProjectActionResult | undefined, FormData>(updateProjectAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={project.slug} />
      <input type="hidden" name="name" value={project.name} />
      <input type="hidden" name="goal" value={project.goal ?? ""} />
      <input type="hidden" name="repoUrl" value={project.repoUrl ?? ""} />
      <input type="hidden" name="stagingUrl" value={project.stagingUrl ?? ""} />
      {result?.error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{result.error}</p> : null}
      <ProjectRewardRulesSection
        initialConfig={project.rewardConfig as ProjectRewardConfig | null}
        disabled={pending}
      />
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save reward rules"}</Button>
        {result && !result.error ? <span role="status" className="ml-3 text-sm text-emerald-800">Reward rules saved.</span> : null}
      </div>
    </form>
  );
}
