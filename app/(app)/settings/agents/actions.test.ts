import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.hoisted(() => vi.fn());
const setAgentBurst = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/agents/registry", () => ({
  createAgent: vi.fn(),
  regenerateKey: vi.fn(),
  revokeAgent: vi.fn(),
  setAgentAreaPreferences: vi.fn(),
  setAgentBurst,
  setAgentLevel: vi.fn(),
}));
vi.mock("@/lib/agents/rate-limit", () => ({ consumePairingLimit: vi.fn() }));
vi.mock("@/lib/agents/pairing", () => ({ approvePairing: vi.fn(), findPendingPairing: vi.fn() }));
vi.mock("@/lib/tenant-context", () => ({ currentTenantIdFor: vi.fn(async () => "tenant_1") }));
vi.mock("@/lib/feature-flags", () => ({ isAgentPlatformEnabled: () => true }));
vi.mock("@/lib/rate-limit", () => ({ RATE_LIMIT_MESSAGE: "Too fast." }));

import { setAgentBurstAction, createAgentAction, revokeAgentAction, pairAgentAction } from "./actions";
import { createAgent, revokeAgent } from "@/lib/agents/registry";
import { approvePairing } from "@/lib/agents/pairing";

describe("agent navigation refresh (#403)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "owner" });
  });
  it("refreshes the layout after explicit creation", async () => {
    vi.mocked(createAgent).mockResolvedValue({ ok: true, key: { name: "Agent", rawKey: "test", prefix: "test" } } as Awaited<ReturnType<typeof createAgent>>);
    await createAgentAction(undefined, new FormData());
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
  it("refreshes the layout after revocation", async () => {
    vi.mocked(revokeAgent).mockResolvedValue({ ok: true });
    await revokeAgentAction("agent");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
  it("refreshes the layout after pairing approval", async () => {
    vi.mocked(approvePairing).mockResolvedValue({ ok: true, name: "Agent" } as Awaited<ReturnType<typeof approvePairing>>);
    const form = new FormData();
    form.set("intent", "approve");
    await pairAgentAction(undefined, form);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
  it("does not refresh after a denied revocation", async () => {
    vi.mocked(revokeAgent).mockResolvedValue({ ok: false, error: "Denied" });
    await revokeAgentAction("agent");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("setAgentBurstAction (#596)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "admin" });
    setAgentBurst.mockResolvedValue({ ok: true });
  });

  it("validates the agent and flag before loading the user", async () => {
    expect(await setAgentBurstAction(null, true)).toMatchObject({ ok: false });
    expect(await setAgentBurstAction("agent1", "yes")).toMatchObject({ ok: false });
    expect(requireUser).not.toHaveBeenCalled();
    expect(setAgentBurst).not.toHaveBeenCalled();
  });

  it("rejects a malformed or past expiry server-side", async () => {
    expect(await setAgentBurstAction("agent1", true, "not-a-date")).toMatchObject({
      ok: false,
      error: expect.stringContaining("Invalid"),
    });
    expect(await setAgentBurstAction("agent1", true, "2020-01-01T00:00:00.000Z")).toMatchObject({
      ok: false,
      error: expect.stringContaining("future"),
    });
    expect(setAgentBurst).not.toHaveBeenCalled();
  });

  it("passes an unexpired timestamp through and revalidates", async () => {
    const until = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    expect(await setAgentBurstAction("agent1", true, until)).toEqual({ ok: true });
    expect(setAgentBurst).toHaveBeenCalledWith({ id: "admin" }, "agent1", true, new Date(until));
    expect(revalidatePath).toHaveBeenCalledWith("/settings/agents");
  });

  it("passes no expiry when the grant is disabled", async () => {
    expect(await setAgentBurstAction("agent1", false)).toEqual({ ok: true });
    expect(setAgentBurst).toHaveBeenCalledWith({ id: "admin" }, "agent1", false, null);
  });

  it("does not revalidate when the caller is not an admin", async () => {
    setAgentBurst.mockResolvedValue({ ok: false, error: "Only an admin can change an agent's write budget." });
    expect(await setAgentBurstAction("agent1", true)).toMatchObject({ ok: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does not report success when persistence fails", async () => {
    setAgentBurst.mockResolvedValue({ ok: false, error: "Couldn't change the write budget. Try again." });
    expect(await setAgentBurstAction("agent1", true)).toMatchObject({ ok: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
