import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { agentIssueRequest, IssueApiError } from "@/lib/agent-api/issues";
import { getProjectGuidance, updateMasterGuidance } from "@/lib/agent-api/guidance";
import { updateGuidanceBodySchema } from "@/lib/validations/guidance";

/**
 * GET /api/v1/projects/[id]/guidance
 * Read the authoritative master project guidance and notes summary (#1256).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return agentIssueRequest(request, "projects.guidance.read", "observer", id, async (agent) => {
    return NextResponse.json(await getProjectGuidance(agent.tenantId, id));
  });
}

/**
 * PUT /api/v1/projects/[id]/guidance
 * Update the master project guidance body directly (#1256).
 * Only project owners / workspace admins can overwrite master guidance.
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return agentIssueRequest(request, "projects.guidance.update", "contributor", id, async (agent) => {
    if (agent.ownerRole !== "admin") {
      throw new IssueApiError(403, "Only workspace admins or owners can edit master guidance.");
    }
    const json = await request.json().catch(() => ({}));
    const parsed = updateGuidanceBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new IssueApiError(400, parsed.error.issues[0]?.message ?? "Invalid guidance payload.");
    }

    const updated = await updateMasterGuidance({
      tenantId: agent.tenantId,
      projectIdOrSlug: id,
      body: parsed.data.body,
      userId: agent.ownerId,
    });

    return NextResponse.json(updated);
  });
}

const apiMethodNotAllowed = createMethodNotAllowed(["GET", "PUT", "HEAD", "OPTIONS"]);
const apiOptions = createOptions(["GET", "PUT", "HEAD", "OPTIONS"]);
export const POST = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = apiOptions;
