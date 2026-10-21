import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest } from "@/lib/agent-api/issues";
import { readAgentQuestion } from "@/lib/agent-questions";

export const runtime = "nodejs";

const DEPRECATION_HEADERS = {
  Deprecation: "true",
  Link: '</api/v1/escalations>; rel="successor-version"',
};

/**
 * GET /api/v1/questions/{id} — legacy question read endpoint (#446, #1053).
 * Deprecated in favor of GET /api/v1/escalations/{id}.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "questions.read", "observer", id, async (agent) =>
    NextResponse.json(
      { question: await readAgentQuestion(agent, id) },
      { headers: DEPRECATION_HEADERS },
    ),
  );
}
