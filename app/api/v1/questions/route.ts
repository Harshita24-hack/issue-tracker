import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest, issueJson } from "@/lib/agent-api/issues";
import { agentQuestionSchema, askAgentQuestion } from "@/lib/agent-questions";

export const runtime = "nodejs";

const DEPRECATION_HEADERS = {
  Deprecation: "true",
  Link: '</api/v1/escalations>; rel="successor-version"',
};

/**
 * POST /api/v1/questions — legacy question endpoint (#446, #1053).
 * Deprecated in favor of POST /api/v1/escalations with type="question".
 * Body: `{ "body": "…", "bugId": "…" }` (bugId optional).
 */
export async function POST(request: NextRequest) {
  return agentIssueRequest(request, "questions.ask", "contributor", null, async (agent) => {
    const parsed = agentQuestionSchema.safeParse(await issueJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid question.", details: parsed.error.issues },
        { status: 400, headers: DEPRECATION_HEADERS },
      );
    }
    return NextResponse.json(
      { question: await askAgentQuestion(agent, parsed.data) },
      { status: 201, headers: DEPRECATION_HEADERS },
    );
  });
}
