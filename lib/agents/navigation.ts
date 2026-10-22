import { prisma } from "@/lib/prisma";

export type AgentNavigationState = "empty" | "active" | "unavailable";

export async function agentNavigationState(userId: string, tenantId: string | null): Promise<AgentNavigationState> {
  if (!tenantId) return "unavailable";
  const count = await prisma.agent.count({
    where: { ownerUserId: userId, tenantId, revokedAt: null, defaultProjectId: null },
  });
  return count > 0 ? "active" : "empty";
}
