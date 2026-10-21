import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { GET } from "./[id]/route";

vi.mock("@/lib/agent-api/issues", () => ({
  agentIssueRequest: vi.fn(async (request, label, level, bugId, handler) => {
    return handler({ agentId: "agent-1", ownerId: "user-1", tenantId: "tenant-1" });
  }),
  issueJson: vi.fn(async (request: NextRequest) => request.json()),
}));

vi.mock("@/lib/agent-questions", () => ({
  agentQuestionSchema: {
    safeParse: vi.fn((data) => ({
      success: true,
      data: { body: data.body ?? "How do I fix this?", bugId: data.bugId },
    })),
  },
  askAgentQuestion: vi.fn(async () => ({
    id: "q-1",
    body: "How do I fix this?",
    createdAt: new Date(),
  })),
  readAgentQuestion: vi.fn(async () => ({
    id: "q-1",
    body: "How do I fix this?",
    answer: "Check the logs",
    createdAt: new Date(),
  })),
}));

describe("Legacy /api/v1/questions deprecation (#1053)", () => {
  it("POST /api/v1/questions returns Deprecation header and Link to /api/v1/escalations", async () => {
    const req = new NextRequest("http://localhost/api/v1/questions", {
      method: "POST",
      body: JSON.stringify({ body: "How do I fix this?" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(res.headers.get("Deprecation")).toBe("true");
    expect(res.headers.get("Link")).toContain("/api/v1/escalations");
  });

  it("GET /api/v1/questions/{id} returns Deprecation header and Link to /api/v1/escalations", async () => {
    const req = new NextRequest("http://localhost/api/v1/questions/q-1", {
      method: "GET",
    });
    const res = await GET(req, { params: Promise.resolve({ id: "q-1" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Deprecation")).toBe("true");
    expect(res.headers.get("Link")).toContain("/api/v1/escalations");
  });
});
