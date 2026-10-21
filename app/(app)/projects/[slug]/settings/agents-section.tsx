import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/local-time";
import { RelativeTime } from "@/components/relative-time";
import {
  AGENT_LEVEL_DESCRIPTIONS,
  AGENT_LEVEL_LABELS,
  AGENT_LEVELS,
  OWNER_REVIEW_LIMIT,
  SEPARATE_LEVEL_AGENTS,
  settableLevels,
} from "@/lib/agents/levels";
import { MAX_ACTIVE_AGENTS_PER_OWNER } from "@/lib/agents/registry-limits";
import { openSecret } from "@/lib/secret-box";
import { CreateAgentForm } from "@/app/(app)/settings/agents/create-agent-form";
import { AgentControls } from "@/app/(app)/settings/agents/agent-controls";
import { AgentRowKey } from "@/app/(app)/settings/agents/agent-row-key";
import type { AgentLevel } from "@prisma/client";

function revealAgentKey(sealed: string | null): string | null {
  if (!sealed) return null;
  try {
    return openSecret(sealed);
  } catch {
    return null;
  }
}

const levelBadge = "bg-slate-100 text-slate-700";

type AgentItem = {
  id: string;
  name: string;
  model: string | null;
  level: AgentLevel;
  burst: boolean;
  burstUntil: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
  defaultProjectId: string | null;
  apiKeys: Array<{
    id: string;
    prefix: string;
    sealedKey: string | null;
    lastUsedAt: Date | null;
    project: { id: string; name: string } | null;
  }>;
  areaPreferences: Array<{
    projectAreaId: string;
    projectArea: { projectId: string };
  }>;
};

type MemberItem = {
  role: string;
  user: {
    id: string;
    name: string;
    agents: Array<{
      id: string;
      name: string;
      model: string | null;
      level: AgentLevel;
      burst: boolean;
      burstUntil: Date | null;
      areaPreferences: Array<{
        projectAreaId: string;
        projectArea: { projectId: string };
      }>;
    }>;
  };
};

export function ProjectAgentsSection({
  userId,
  isAdmin,
  projects,
  activeProjectId,
  mine,
  members,
  areas,
  now = new Date(),
}: {
  userId: string;
  isAdmin: boolean;
  projects: Array<{ id: string; name: string; slug: string }>;
  activeProjectId?: string | null;
  mine: AgentItem[];
  members: MemberItem[];
  areas: Array<{ id: string; name: string; projectId: string }>;
  now?: Date;
}) {
  const ownLevels = settableLevels({ isOwner: true, isTenantAdmin: isAdmin });
  const adminLevels = settableLevels({ isOwner: false, isTenantAdmin: true });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
            <Link
              href="/settings/agents/connect"
              className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 hover:underline"
            >
              Connect your agent &rarr;
            </Link>
            <Link
              href="/settings/audit"
              className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 hover:underline"
            >
              Agent audit log →
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 hover:underline"
            >
              API Docs →
            </Link>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          {SEPARATE_LEVEL_AGENTS} You can keep {MAX_ACTIVE_AGENTS_PER_OWNER} active agents in this workspace.{" "}
          {OWNER_REVIEW_LIMIT}
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="register-heading">
        <h2 id="register-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Add an agent
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Register a separate agent for a level you don&apos;t have yet, or approve one that asked to join at{" "}
          <Link href="/settings/agents/pair" className="text-teal-700 underline">
            the approval page
          </Link>
          .
        </p>
        <div className="mt-4">
          <CreateAgentForm
            projects={projects}
            activeProjectId={activeProjectId}
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="my-agents-heading">
        <h2 id="my-agents-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Your agents
        </h2>
        {mine.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No agents yet. Register the first one above.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {mine.map((agent) => (
              <li key={agent.id} className="py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {agent.name}
                      {agent.model ? <span className="text-slate-500"> · {agent.model}</span> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {agent.revokedAt ? (
                        <>
                          Revoked <LocalTime date={agent.revokedAt} />
                        </>
                      ) : agent.apiKeys.length === 0 ? (
                        <span>No key · added <LocalTime date={agent.createdAt} /></span>
                      ) : (
                        <span>
                          {agent.apiKeys.some((key) => key.lastUsedAt) ? (
                            <>
                              Last used <RelativeTime date={agent.apiKeys.find((key) => key.lastUsedAt)!.lastUsedAt!} />
                            </>
                          ) : (
                            <>Never used</>
                          )}
                          {" "}· added <LocalTime date={agent.createdAt} />
                        </span>
                      )}
                    </p>
                    {agent.revokedAt ? null : (
                      <div className="mt-2 space-y-1.5">
                        {agent.apiKeys.map((key) => (
                          <AgentRowKey
                            key={key.id}
                            apiKey={revealAgentKey(key.sealedKey)}
                            prefix={key.prefix}
                            projectId={key.project?.id ?? null}
                            projectName={key.project?.name ?? null}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  {agent.revokedAt ? (
                    <Badge className="bg-red-50 text-red-700">Revoked</Badge>
                  ) : (
                    <AgentControls
                      agentId={agent.id}
                      agentName={agent.name}
                      level={agent.level}
                      levels={ownLevels}
                      projects={projects}
                      currentProjectId={agent.apiKeys.find((key) => key.project)?.project?.id}
                      burst={agent.burst}
                      burstUntil={agent.burstUntil}
                      now={now}
                      canSetBurst={isAdmin}
                      areas={areas}
                      areaPreferences={agent.areaPreferences.map((preference) => ({
                        projectId: preference.projectArea.projectId,
                        projectAreaId: preference.projectAreaId,
                      }))}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="team-heading">
        <h2 id="team-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Team
        </h2>
        <p className="mt-2 text-sm text-slate-600">Everyone in your team and the agents working for them.</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {members.map(({ role, user: member }) => (
            <li key={member.id} className="py-3">
              <p className="text-sm font-medium text-slate-900">
                <Link href={`/users/${member.id}`} className="hover:underline">
                  {member.name}
                </Link>
                {role !== "member" ? <Badge className={`ml-2 ${levelBadge}`}>{role === "owner" ? "Owner" : "Admin"}</Badge> : null}
              </p>
              {member.agents.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">No agents</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {member.agents.map((agent) => (
                    <li key={agent.id} className="flex flex-col gap-2 pl-4 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm text-slate-700">
                        {agent.name}
                        {agent.model ? <span className="text-slate-500"> · {agent.model}</span> : null}
                        {isAdmin && member.id !== userId ? (
                          <>
                            {" "}·{" "}
                            <Link href={`/settings/agents/${agent.id}/messages`} className="text-xs text-teal-700 hover:underline">
                              Message
                            </Link>
                          </>
                        ) : null}
                      </span>
                      {isAdmin && member.id !== userId ? (
                        <AgentControls
                          agentId={agent.id}
                          agentName={agent.name}
                          level={agent.level}
                          levels={adminLevels}
                          projects={projects}
                          currentProjectId={activeProjectId}
                          burst={agent.burst}
                          burstUntil={agent.burstUntil}
                          now={now}
                          canSetBurst
                          areas={areas}
                          areaPreferences={agent.areaPreferences.map((preference) => ({
                            projectId: preference.projectArea.projectId,
                            projectAreaId: preference.projectAreaId,
                          }))}
                        />
                      ) : (
                        <Badge className={levelBadge}>{AGENT_LEVEL_LABELS[agent.level]}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="levels-heading">
        <h2 id="levels-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Levels
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          {AGENT_LEVELS.map((level) => (
            <div key={level} className="sm:flex sm:gap-3">
              <dt className="font-medium text-slate-900 sm:w-28">{AGENT_LEVEL_LABELS[level]}</dt>
              <dd className="text-slate-600">{AGENT_LEVEL_DESCRIPTIONS[level]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
