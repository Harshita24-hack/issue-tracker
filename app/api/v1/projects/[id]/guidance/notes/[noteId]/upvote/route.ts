import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest } from "@/lib/agent-api/issues";
import { upvoteProjectGuidanceNote } from "@/lib/agent-api/guidance";

/**
 * POST /api/v1/projects/[id]/guidance/notes/[noteId]/upvote
 * Upvote a project guidance note or learning (#1256).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; noteId: string }> },
) {
  const { id, noteId } = await context.params;
  return agentIssueRequest(request, "projects.guidance.notes.upvote", "observer", noteId, async (agent) => {
    const result = await upvoteProjectGuidanceNote({
      tenantId: agent.tenantId,
      projectIdOrSlug: id,
      noteId,
      agentId: agent.agentId,
    });

    return NextResponse.json(result);
  });
}

const apiMethodNotAllowed = createMethodNotAllowed(["POST", "HEAD", "OPTIONS"]);
const apiOptions = createOptions(["POST", "HEAD", "OPTIONS"]);
export const GET = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
