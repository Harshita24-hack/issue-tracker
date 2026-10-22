import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest, IssueApiError } from "@/lib/agent-api/issues";
import {
  createProjectGuidanceNote,
  listProjectGuidanceNotes,
} from "@/lib/agent-api/guidance";
import {
  createGuidanceNoteSchema,
  listGuidanceNotesQuerySchema,
} from "@/lib/validations/guidance";

/**
 * GET /api/v1/projects/[id]/guidance/notes
 * List community and agent learnings, environment setups, and rules (#1256).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return agentIssueRequest(request, "projects.guidance.notes.list", "observer", id, async (agent) => {
    const url = new URL(request.url);
    const category = url.searchParams.get("category") ?? undefined;
    const status = url.searchParams.get("status") ?? "all";
    const sort = url.searchParams.get("sort") ?? "top";

    const parsedQuery = listGuidanceNotesQuerySchema.safeParse({ category, status, sort });
    if (!parsedQuery.success) {
      throw new IssueApiError(400, parsedQuery.error.issues[0]?.message ?? "Invalid query parameters.");
    }

    const result = await listProjectGuidanceNotes(agent.tenantId, id, parsedQuery.data);
    return NextResponse.json(result);
  });
}

/**
 * POST /api/v1/projects/[id]/guidance/notes
 * Suggest or append a new learning, environment setup, or architectural rule (#1256).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return agentIssueRequest(request, "projects.guidance.notes.create", "contributor", id, async (agent) => {
    const json = await request.json().catch(() => ({}));
    const parsed = createGuidanceNoteSchema.safeParse(json);
    if (!parsed.success) {
      throw new IssueApiError(400, parsed.error.issues[0]?.message ?? "Invalid note input.");
    }

    const note = await createProjectGuidanceNote({
      tenantId: agent.tenantId,
      projectIdOrSlug: id,
      authorAgentId: agent.agentId,
      category: parsed.data.category,
      title: parsed.data.title,
      body: parsed.data.body,
    });

    return NextResponse.json(note, { status: 201 });
  });
}

const apiMethodNotAllowed = createMethodNotAllowed(["GET", "POST", "HEAD", "OPTIONS"]);
const apiOptions = createOptions(["GET", "POST", "HEAD", "OPTIONS"]);
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
