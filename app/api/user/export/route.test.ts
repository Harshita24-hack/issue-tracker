import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.hoisted(() => vi.fn());
const exportUserData = vi.hoisted(() => vi.fn());
const consumeRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("@/lib/user-data-export", () => ({
  exportUserData,
  DATA_EXPORT_RATE_LIMIT: { max: 5, windowMs: 60 * 60 * 1000 },
}));
vi.mock("@/lib/rate-limit", () => ({
  consumeRateLimit,
  RATE_LIMIT_MESSAGE: "You're doing that too fast. Please wait a moment.",
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { GET } from "./route";

describe("GET /api/user/export (#571)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeRateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  });

  it("returns 200 with exported user data and attachment header", async () => {
    requireUser.mockResolvedValue({ id: "user-test" });
    const mockExport = {
      user: { id: "user-test", name: "Tester", email: "test@example.com" },
      exportedAt: "2026-10-20T20:00:00.000Z",
      issues: [],
      comments: [],
      votes: [],
      points: [],
    };
    exportUserData.mockResolvedValue(mockExport);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="data-export-user-test.json"',
    );

    const body = await response.json();
    expect(body).toEqual(mockExport);
    expect(exportUserData).toHaveBeenCalledWith(expect.anything(), "user-test");
  });

  it("returns 500 if export throws", async () => {
    requireUser.mockResolvedValue({ id: "user-error" });
    exportUserData.mockRejectedValue(new Error("Database error"));

    const response = await GET();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Failed to export user data" });
  });

  it("returns 429 and skips the export when the rate limit is exhausted (#1024)", async () => {
    requireUser.mockResolvedValue({ id: "user-flood" });
    consumeRateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 60_000 });

    const response = await GET();

    expect(response.status).toBe(429);
    expect((await response.json()).error).toMatch(/too fast/i);
    // The expensive work is skipped entirely.
    expect(exportUserData).not.toHaveBeenCalled();
  });

  it("keys the rate limit per user (#1024)", async () => {
    requireUser.mockResolvedValue({ id: "user-keyed" });
    exportUserData.mockResolvedValue({
      user: { id: "user-keyed", name: "T", email: "t@example.com" },
      exportedAt: "2026-10-20T20:00:00.000Z",
      issues: [],
      comments: [],
      votes: [],
      points: [],
    });

    await GET();

    expect(consumeRateLimit).toHaveBeenCalledWith(
      "user-export:user-keyed",
      expect.objectContaining({ max: expect.any(Number), windowMs: expect.any(Number) }),
    );
  });
});
