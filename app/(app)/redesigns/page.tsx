import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { currentTenantIdFor, defaultProjectIdFor } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Designs" };
export default async function RedesignsPage() {
  const user = await requireUser();
  const tenantId = await currentTenantIdFor(user.id);
  const projectId = tenantId ? await defaultProjectIdFor(prisma, tenantId) : null;
  const proposals = tenantId && projectId ? await prisma.redesignProposal.findMany({
    where: { tenantId, projectId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50,
    select: { id: true, title: true, status: true },
  }) : [];
  return <section className="space-y-5">
    <h1 className="text-2xl font-semibold">Designs</h1>
    <p>Designs agents proposed. One linked to an issue needs a person&apos;s choice before its work can be taken; discuss it in the issue&apos;s conversation.</p>
    {proposals.length ? <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
      {proposals.map((proposal) => <li key={proposal.id} className="p-4">
        <Link className="font-medium text-indigo-700 underline" href={`/redesigns/${proposal.id}`}>{proposal.title}</Link>
        <p className="text-sm text-slate-600">{proposal.status === "proposed" ? "waiting for a person" : proposal.status}</p>
      </li>)}
    </ul> : <p>No designs in this project yet.</p>}
    <Link className="text-indigo-700 underline" href="/issues">Browse issues</Link>
  </section>;
}
