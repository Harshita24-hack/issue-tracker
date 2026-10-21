import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest, issueJson } from "@/lib/agent-api/issues";
import { addDesignRevision, designRevisionSchema } from "@/lib/redesigns";

/**
 * POST /api/v1/redesigns/{id}/revisions (alias /api/v1/designs/{id}/revisions)
 * — the proposing agent adds a revision to its own design (#1048).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "redesigns.revise", "contributor", id, async (agent) => {
    const parsed = designRevisionSchema.safeParse(await issueJson(request));
    if (!parsed.success) return NextResponse.json({ error: "Invalid design revision.", details: parsed.error.issues }, { status: 400 });
    return NextResponse.json({ revision: await addDesignRevision(agent, id, parsed.data) }, { status: 201 });
  });
}
