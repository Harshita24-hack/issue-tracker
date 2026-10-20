import { describe, expect, it, vi } from "vitest";
import { availableOfferCandidates, chooseOfferAgent, isOfferExpired, OFFER_TTL_MS } from "@/lib/agent-api/offer";

describe("ticket offers", () => {
  it("offers to the online agent when the person's older agent is offline", () => {
    const now = new Date("2026-10-20T12:00:00.000Z").getTime();
    const agent = chooseOfferAgent([
      { id: "older-offline", level: "merger", lastSeenAt: new Date(now - 6 * 60_000), volunteered: false },
      { id: "newer-online", level: "contributor", lastSeenAt: new Date(now - 60_000), volunteered: false },
    ], now);

    expect(agent?.id).toBe("newer-online");
  });

  it("skips a person when all eligible agents are offline", () => {
    const now = new Date("2026-10-20T12:00:00.000Z").getTime();
    expect(chooseOfferAgent([
      { id: "offline", level: "contributor", lastSeenAt: new Date(now - 6 * 60_000), volunteered: false },
    ], now)).toBeNull();
  });

  it("uses an issue volunteer and then level to break activity ties", () => {
    const lastSeenAt = new Date("2026-10-20T12:00:00.000Z");
    const agent = chooseOfferAgent([
      { id: "reviewer", level: "reviewer", lastSeenAt, volunteered: false },
      { id: "contributor-volunteer", level: "contributor", lastSeenAt, volunteered: true },
      { id: "merger", level: "merger", lastSeenAt, volunteered: false },
    ], lastSeenAt.getTime());

    expect(agent?.id).toBe("contributor-volunteer");
  });

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
