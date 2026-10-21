import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAgent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agents/require-agent", async (original) => ({
  ...(await original<typeof import("@/lib/agents/require-agent")>()),
  requireAgent,
}));
const prisma = vi.hoisted(() => ({
  project: { findMany: vi.fn() },
  agent: { findUnique: vi.fn() },
  agentReputation: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma }));

import { GET } from "./route";

describe("GET /api/v1/agents/me (#742)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.project.findMany.mockResolvedValue([
      { id: "project_web", slug: "web", name: "Web" },
      { id: "project_api", slug: "api", name: "API" },
    ]);
    prisma.agent.findUnique.mockResolvedValue({ instructions: null });
    // No snapshot row by default: the neutral fallback (#594).
    prisma.agentReputation.findUnique.mockResolvedValue(null);
  });

  it("returns the project the key is limited to", async () => {
    requireAgent.mockResolvedValue({
      agentId: "agent1",
      name: "Ada's Claude",
      ownerId: "ada",
      tenantId: "tenant_zedu",
      level: "observer",
      projectId: "project_web",
      projectSlug: "web",
    });
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/agents/me"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-ratelimit-limit")).toBe("600");
    expect(response.headers.get("x-ratelimit-remaining")).not.toBeNull();
    expect(response.headers.get("x-ratelimit-reset")).not.toBeNull();
    await expect(response.json()).resolves.toEqual({
      id: "agent1",
      name: "Ada's Claude",
      owner_id: "ada",
      tenant_id: "tenant_zedu",
      level: "observer",
      project_id: "project_web",
      project_slug: "web",
      projects: [
        { id: "project_web", slug: "web", name: "Web" },
        { id: "project_api", slug: "api", name: "API" },
      ],
      instructions: null,
      reputation: {
        score: 0.7,
        data_points: 0,
        fixes_accepted: 0,
        fixes_failed: 0,
        validations_upheld: 0,
        validations_overturned: 0,
        silence_releases: 0,
        deadline_releases: 0,
        median_deliver_ms: null,
      },
    });
  });

  it("returns the agent's reputation snapshot when one exists (#594)", async () => {
    requireAgent.mockResolvedValue({
      agentId: "agent1", name: "Ada's Claude", ownerId: "ada", tenantId: "tenant_zedu",
      level: "builder", projectId: null, projectSlug: null,
    });
    prisma.agentReputation.findUnique.mockResolvedValue({
      agentId: "agent1",
      tenantId: "tenant_zedu",
      score: 0.9,
      dataPoints: 12,
      fixesAccepted: 4,
      fixesFailed: 1,
      validationsUpheld: 6,
      validationsOverturned: 1,
      silenceReleases: 2,
      deadlineReleases: 1,
      medianDeliverMs: 480000,
    });
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/agents/me"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      reputation: {
        score: 0.9,
        data_points: 12,
        fixes_accepted: 4,
        fixes_failed: 1,
        validations_upheld: 6,
        validations_overturned: 1,
        silence_releases: 2,
        deadline_releases: 1,
        median_deliver_ms: 480000,
      },
    });
    expect(prisma.agentReputation.findUnique).toHaveBeenCalledWith({ where: { agentId: "agent1" } });
  });

  it("lists the tenant's projects so an unscoped key can discover its projectId (#607)", async () => {
    requireAgent.mockResolvedValue({
      agentId: "agent1", name: "Ada's Claude", ownerId: "ada", tenantId: "tenant_zedu",
      level: "observer", projectId: null, projectSlug: null,
    });
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/agents/me"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projects.map((project: { id: string }) => project.id)).toEqual(["project_web", "project_api"]);
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant_zedu" }, orderBy: { slug: "asc" },
      select: { id: true, slug: true, name: true },
    });
  });

  it("returns the owner's standing instructions (#605)", async () => {
    requireAgent.mockResolvedValue({
      agentId: "agent1", name: "Ada's Claude", ownerId: "ada", tenantId: "tenant_zedu",
      level: "observer", projectId: null, projectSlug: null,
    });
    prisma.agent.findUnique.mockResolvedValue({ instructions: "Focus on desktop bugs today." });
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/agents/me"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ instructions: "Focus on desktop bugs today." });
    expect(prisma.agent.findUnique).toHaveBeenCalledWith({ where: { id: "agent1" }, select: { instructions: true } });
  });
});
