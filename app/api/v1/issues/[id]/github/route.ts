import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { agentIssueRequest, issueJson } from "@/lib/agent-api/issues";
import { linkPullRequest } from "@/lib/agent-api/link-pr";

export const runtime = "nodejs";

const bodySchema = z
  .object({ pullRequestUrl: z.string().trim().min(1).max(2048) })
  .strict();

/**
 * POST /api/v1/issues/{id}/github — link the pull request that fixes this
 * issue (#452). The calling agent must hold the active claim. A contributor
 * or above may attach the URL, which is audited.
 *
 * When the fix has already been accepted (#434), the same call tries to merge
 * the pull request through the project's GitHub App installation; the merge is
 * gated on acceptance, an in-repo PR, green checks, and permission. Attaching
 * before acceptance links only — no merge is attempted.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return agentIssueRequest(request, "github.linked", "contributor", id, async (agent) => {
    const parsed = bodySchema.safeParse(await issueJson(request));
    if (!parsed.success) {
      return NextResponse.json({ error: "Send a pull request URL." }, { status: 400 });
    }

    const result = await linkPullRequest(agent, id, parsed.data.pullRequestUrl);
    return NextResponse.json(result.body, { status: result.status });
  });
}
