import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: { agent: { count: vi.fn() } } }));
import { prisma } from "@/lib/prisma";
import { agentNavigationState } from "./navigation";

beforeEach(() => vi.resetAllMocks());

describe("agent navigation state", () => {
  it("counts explicitly added non-revoked agents owned by the user in the current workspace", async () => {
    vi.mocked(prisma.agent.count).mockResolvedValue(0);
    expect(await agentNavigationState("user", "workspace")).toBe("empty");
    expect(prisma.agent.count).toHaveBeenCalledWith({ where: { ownerUserId: "user", tenantId: "workspace", revokedAt: null, defaultProjectId: null } });
    vi.mocked(prisma.agent.count).mockResolvedValue(2);
    expect(await agentNavigationState("user", "workspace")).toBe("active");
  });

  it("does not query across workspaces when no workspace is selected", async () => {
    expect(await agentNavigationState("user", null)).toBe("unavailable");
    expect(prisma.agent.count).not.toHaveBeenCalled();
  });

  it("propagates database failure so the caller can display unavailable state", async () => {
    vi.mocked(prisma.agent.count).mockRejectedValue(new Error("offline"));
    await expect(agentNavigationState("user", "workspace")).rejects.toThrow("offline");
  });
});
