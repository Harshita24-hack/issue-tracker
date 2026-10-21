"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  addCoordinatorAction,
  removeCoordinatorAction,
  type CoordinatorActionResult,
} from "./coordinator-actions";

export type CoordinatorRow = { userId: string; label: string; owner: boolean };
export type MemberOption = { userId: string; label: string };

/**
 * #1049: who makes the final call on this project's issues — merging,
 * resolving and closing, and so the points that pays. Not the same as admin.
 */
export function CoordinatorsSection({
  slug,
  coordinators,
  members,
  canManage,
}: {
  slug: string;
  coordinators: CoordinatorRow[];
  members: MemberOption[];
  canManage: boolean;
}) {
  const [added, add, adding] = useActionState<CoordinatorActionResult | undefined, FormData>(addCoordinatorAction, undefined);
  const [removed, remove, removing] = useActionState<CoordinatorActionResult | undefined, FormData>(removeCoordinatorAction, undefined);
  const taken = new Set(coordinators.map((row) => row.userId));
  const candidates = members.filter((member) => !taken.has(member.userId));
  const error = (added && !added.ok ? added.error : null) ?? (removed && !removed.ok ? removed.error : null);

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="coordinators-heading">
      <div>
        <h2 id="coordinators-heading" className="text-base font-semibold text-slate-900">Coordinators</h2>
        <p className="mt-1 text-sm text-slate-600">
          Coordinators make the final call on this project&apos;s issues: merging a fix, resolving or closing an issue, and so
          the points that pays. Only they, and their agents, can. Being an admin doesn&apos;t make someone a coordinator.
        </p>
      </div>
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      <ul className="divide-y divide-slate-100" aria-label="Coordinators">
        {coordinators.map((row) => (
          <li key={row.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0 text-sm text-slate-900">
              {row.label}
              {row.owner ? <span className="ml-2 text-xs text-slate-500">Owner, always a coordinator</span> : null}
            </span>
            {canManage && !row.owner ? (
              <form action={remove}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="userId" value={row.userId} />
                <Button type="submit" variant="secondary" disabled={removing} aria-label={`Remove ${row.label} as coordinator`}>
                  Remove
                </Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage && candidates.length > 0 ? (
        <form action={add} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="slug" value={slug} />
          <label htmlFor="coordinator-user" className="block flex-1 space-y-1 text-sm font-medium text-slate-800">
            Add a coordinator
            <select
              id="coordinator-user"
              name="userId"
              required
              defaultValue=""
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="" disabled>Choose a member</option>
              {candidates.map((member) => (
                <option key={member.userId} value={member.userId}>{member.label}</option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={adding}>{adding ? "Adding…" : "Add"}</Button>
        </form>
      ) : null}
      {!canManage ? (
        <p className="text-xs text-slate-500">Only the organization&apos;s owners can change who coordinates.</p>
      ) : null}
    </section>
  );
}
