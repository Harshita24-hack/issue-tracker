import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { LocalTime } from "@/components/local-time";
import { DecisionButtons } from "../decision-buttons";

export const metadata = { title: "Review design" };
export default async function RedesignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const tenantId = await currentTenantIdFor(user.id);
  if (!tenantId) notFound();
  const { id } = await params;
  const proposal = await prisma.redesignProposal.findFirst({ where: { id, tenantId },
    include: {
      authorAgent: { select: { name: true } }, onBehalfOf: { select: { name: true } }, approver: { select: { name: true } },
      // #1048: every revision, newest first. The proposal's own body is the latest.
      revisions: { orderBy: { number: "desc" }, select: { id: true, number: true, body: true, previewUrl: true, createdAt: true } },
    },
  });
  if (!proposal) notFound();
  return <article className="space-y-5">
    <Link href="/redesigns" className="text-indigo-700 underline">All designs</Link>
    <h1 className="text-2xl font-semibold">{proposal.title}</h1>
    <p className="text-sm text-slate-600">Proposed by {proposal.authorAgent.name} for {proposal.onBehalfOf.name}.</p>
    <p className="font-medium">{proposal.status === "proposed" ? "waiting for a person" : proposal.status}</p>
    {proposal.revisions.length > 1 ? <p className="text-sm text-slate-600">Revision {proposal.revisions[0].number}</p> : null}
    <div className="whitespace-pre-wrap rounded border border-slate-200 bg-white p-5">{proposal.body}</div>
    {proposal.previewUrl ? <a className="block text-indigo-700 underline" href={proposal.previewUrl} target="_blank" rel="noreferrer">Open live preview</a> : null}
    {proposal.revisions.length > 1 ? <section aria-labelledby="revisions-heading" className="space-y-3">
      <h2 id="revisions-heading" className="text-lg font-semibold">Earlier revisions</h2>
      {proposal.revisions.slice(1).map((revision) => <details key={revision.id} className="rounded border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">Revision {revision.number} · <LocalTime date={revision.createdAt} /></summary>
        <div className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{revision.body}</div>
        {revision.previewUrl ? <a className="mt-2 block text-sm text-indigo-700 underline" href={revision.previewUrl} target="_blank" rel="noreferrer">Preview</a> : null}
      </details>)}
    </section> : null}
    {proposal.bugId ? <p className="text-sm text-slate-600">Discuss this design in the linked issue&apos;s conversation.</p> : null}
    {proposal.bugId && <Link href={`/issues/${proposal.bugId}`} className="block text-indigo-700 underline">View linked issue</Link>}
    {proposal.status === "proposed" && !proposal.bugId && <DecisionButtons id={proposal.id} />}
    {proposal.approvedAt && <p className="text-sm text-slate-600">Approved by {proposal.approver?.name ?? "a workspace member"} at <LocalTime date={proposal.approvedAt} />.</p>}
  </article>;
}
