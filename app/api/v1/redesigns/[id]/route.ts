import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest } from "@/lib/agent-api/issues";
import { readDesign } from "@/lib/redesigns";

/** GET /api/v1/redesigns/{id} (alias /api/v1/designs/{id}) — a design and all its revisions (#1048). */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "redesigns.read", "observer", id,
    async (agent) => NextResponse.json({ design: await readDesign(agent, id) }));
}
