import { describe, expect, it, vi } from "vitest";
import {
  AGENT_PRESENCE_WINDOW_MS,
  availableOfferCandidates,
  isAgentOnline,
  isOfferExpired,
  OFFER_TTL_MS,
  pickOfferAgent,
} from "@/lib/agent-api/offer";

describe("ticket offers", () => {
  it("expires an offer at 60 seconds, but not before", () => {
    const offeredAt = new Date("2026-10-19T12:00:00.000Z");
    const start = offeredAt.getTime();
    expect(isOfferExpired(offeredAt, start + OFFER_TTL_MS - 1)).toBe(false);
    expect(isOfferExpired(offeredAt, start + OFFER_TTL_MS)).toBe(true);
    expect(isOfferExpired(null, start)).toBe(true);
  });

  it("selects the fewest active claims, then the person least recently offered", () => {
    const old = new Date("2026-10-19T11:00:00.000Z");
    const recent = new Date("2026-10-19T11:30:00.000Z");
    const candidates = [
      { beneficiaryUserId: "busy", agentId: "a", activeClaims: 1, lastOfferedAt: null },
      { beneficiaryUserId: "recent", agentId: "b", activeClaims: 0, lastOfferedAt: recent },
      { beneficiaryUserId: "never", agentId: "c", activeClaims: 0, lastOfferedAt: null },
      { beneficiaryUserId: "old", agentId: "d", activeClaims: 0, lastOfferedAt: old },
    ];
    expect(availableOfferCandidates(candidates).map((person) => person.beneficiaryUserId)).toEqual(["never", "old", "recent", "busy"]);
  });

  it("skips people at the active claim cap or with another pending offer", () => {
    const people = [
      { beneficiaryUserId: "full", agentId: "a", activeClaims: 2, lastOfferedAt: null },
      { beneficiaryUserId: "pending", agentId: "b", activeClaims: 0, lastOfferedAt: null, pendingOffer: true },
      { beneficiaryUserId: "available", agentId: "c", activeClaims: 1, lastOfferedAt: null },
    ];
    expect(availableOfferCandidates(people).map((person) => person.beneficiaryUserId)).toEqual(["available"]);
  });

  it("sweeps expired offers and calls expireOffer for each (#681)", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { sweepExpiredOffers } = await import("@/lib/agent-api/offer");

    const findManySpy = vi.spyOn(prisma.issueClaim, "findMany").mockResolvedValueOnce([
      { id: "claim-1" } as never,
      { id: "claim-2" } as never,
    ]);
    const txMock = {
      issueClaim: {
        findUnique: vi.fn().mockResolvedValue({
          id: "claim-1",
          bugId: "bug-1",
          status: "offered",
          offeredAt: new Date(Date.now() - 100_000),
          releasedAt: null,
          agentId: "agent-1",
          beneficiaryUserId: "user-1",
          bug: { tenantId: "tenant-1", id: "bug-1", title: "Bug 1", projectId: "proj-1", assigneeId: null },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      bug: {
        findFirst: vi.fn(),
      },
      membership: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentEvent: {
        create: vi.fn().mockResolvedValue({ id: "e1" }),
      },
      webhookSubscription: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: "bug-1" }]),
    };
    vi.spyOn(prisma, "$transaction").mockImplementation(async (fn: unknown) =>
      (fn as (tx: unknown) => unknown)(txMock),
    );

    const result = await sweepExpiredOffers("tenant-1");
    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "offered",
          releasedAt: null,
          bug: { tenantId: "tenant-1" },
        }),
      }),
    );
    expect(result.expired).toBe(2);
  });
});

describe("which of a person's agents gets the offer (#591)", () => {
  const now = new Date("2026-10-19T12:00:00.000Z");
  const seen = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);
  const agent = (id: string, overrides: Record<string, unknown> = {}) => ({
    id, level: "contributor", createdAt: new Date("2026-10-01T00:00:00.000Z"),
    lastSeenAt: seen(1), volunteered: false, ...overrides,
  });

  it("treats an agent as online only inside the presence window", () => {
    expect(isAgentOnline({ lastSeenAt: seen(0) }, now.getTime())).toBe(true);
    expect(isAgentOnline({ lastSeenAt: seen(AGENT_PRESENCE_WINDOW_MS / 60_000 - 1) }, now.getTime())).toBe(true);
    expect(isAgentOnline({ lastSeenAt: seen(AGENT_PRESENCE_WINDOW_MS / 60_000 + 1) }, now.getTime())).toBe(false);
    expect(isAgentOnline({ lastSeenAt: null }, now.getTime())).toBe(false);
  });

  it("picks the most recently seen agent, even when the older one is online", () => {
    const older = agent("agent-old", { createdAt: new Date("2026-09-01T00:00:00.000Z"), lastSeenAt: seen(30) });
    const newer = agent("agent-new", { createdAt: new Date("2026-10-15T00:00:00.000Z"), lastSeenAt: seen(2) });
    expect(pickOfferAgent([older, newer], now.getTime())?.id).toBe("agent-new");
  });

  it("skips a person whose agents are all offline", () => {
    const offline = [agent("agent-a", { lastSeenAt: seen(20) }), agent("agent-b", { lastSeenAt: null })];
    expect(pickOfferAgent(offline, now.getTime())).toBeNull();
    expect(pickOfferAgent([], now.getTime())).toBeNull();
  });

  it("prefers the agent that volunteered for this issue", () => {
    const quiet = agent("agent-quiet", { lastSeenAt: seen(0) });
    const volunteer = agent("agent-volunteer", { lastSeenAt: seen(4), volunteered: true });
    expect(pickOfferAgent([quiet, volunteer], now.getTime())?.id).toBe("agent-volunteer");
  });

  it("breaks a recency tie on level, then on who was registered first", () => {
    const seenAt = seen(1);
    const contributor = agent("agent-contributor", { lastSeenAt: seenAt });
    const merger = agent("agent-merger", { lastSeenAt: seenAt, level: "merger" });
    const early = agent("agent-early", { lastSeenAt: seenAt, createdAt: new Date("2026-01-01T00:00:00.000Z") });
    const late = agent("agent-late", { lastSeenAt: seenAt, createdAt: new Date("2026-06-01T00:00:00.000Z") });
    expect(pickOfferAgent([contributor, merger], now.getTime())?.id).toBe("agent-merger");
    expect(pickOfferAgent([late, early], now.getTime())?.id).toBe("agent-early");
  });

  it("offers through offerNext to the person's online agent, not their oldest", async () => {
    const online = { id: "agent-online", level: "contributor", createdAt: new Date("2026-02-01T00:00:00.000Z"), apiKeys: [{ lastUsedAt: seen(1) }], bids: [] };
    const offline = { id: "agent-offline", level: "contributor", createdAt: new Date("2026-01-01T00:00:00.000Z"), apiKeys: [{ lastUsedAt: seen(30) }], bids: [] };
    const db = {
      membership: { findMany: vi.fn().mockResolvedValue([{ userId: "mark", user: { agents: [offline, online] } }]) },
      issueClaim: {
        groupBy: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: "claim-1", status: "offered", offeredAt: seen(0) }),
      },
      agentEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
      webhookSubscription: { findMany: vi.fn().mockResolvedValue([]) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const { offerNext } = await import("@/lib/agent-api/offer");
    vi.spyOn(Date, "now").mockReturnValue(now.getTime());
    try {
      const result = await offerNext(db as never, { tenantId: "tenant-1" }, { id: "bug-1", projectId: "proj-1", title: "Bug" });
      expect(db.issueClaim.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ beneficiaryUserId: "mark", agentId: "agent-online" }),
      }));
      expect(result?.beneficiaryUserId).toBe("mark");
    } finally {
      vi.restoreAllMocks();
    }
  });
});
