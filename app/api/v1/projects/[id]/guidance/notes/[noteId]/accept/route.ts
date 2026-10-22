import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest, IssueApiError } from "@/lib/agent-api/issues";
import { acceptAndFoldGuidanceNote } from "@/lib/agent-api/guidance";

/**
 * POST /api/v1/projects/[id]/guidance/notes/[noteId]/accept
 * Accept a guidance note and fold it into the master project guidance (#1256).
 * Restricted to project coordinators / workspace admins.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; noteId: string }> },
) {
  const { id, noteId } = await context.params;
  return agentIssueRequest(request, "projects.guidance.notes.accept", "contributor", noteId, async (agent) => {
    if (agent.ownerRole !== "admin") {
      throw new IssueApiError(403, "Only workspace admins or owners can accept and fold notes into master guidance.");
    }

    const result = await acceptAndFoldGuidanceNote({
      tenantId: agent.tenantId,
      projectIdOrSlug: id,
      noteId,
      userId: agent.ownerId,
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
