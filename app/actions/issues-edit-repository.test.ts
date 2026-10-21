import { describe, expect, it, vi, beforeEach } from "vitest";

const publishWebEvent = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/agent-api/web-events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent-api/web-events")>()),
  publishWebEvent,
}));

vi.mock("@/lib/tenant-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenant-context")>()),
  currentTenantIdFor: vi.fn(async () => "tenant-zedu"),
  defaultProjectIdFor: vi.fn(async () => "project-zedu"),
  tenantIdForUser: vi.fn(async () => "tenant-zedu"),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

const requireUser = vi.hoisted(() =>
  vi.fn(async () => ({ id: "reporter-1", name: "Ada", role: "user" })),
);
vi.mock("@/lib/auth-helpers", () => ({ requireUser }));

vi.mock("@/lib/tenant-access", () => ({
  currentTenantAccess: vi.fn(async () => ({
    tenantId: "tenant-zedu",
    tenantName: "Zedu",
    tenantSlug: "zedu",
    membershipRole: "member",
    admin: false,
  })),
}));

vi.mock("@/lib/session-user", () => ({
  resolveSessionUserId: vi.fn(),
  SESSION_EXPIRED_MESSAGE: "Session expired, sign in again",
}));

vi.mock("@/lib/notify", () => ({
  notifyLater: vi.fn(),
}));

const tx = vi.hoisted(() => ({
  bug: { update: vi.fn() },
  bugActivity: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bug: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  },
}));

import { prisma } from "@/lib/prisma";
import { editRepositoryAction } from "./issues";
import { TICKET_EDIT_ERRORS } from "@/lib/ticket-editing";

/** #1047: the reporter or an admin changes where an issue's work happens. */

const findBugMock = vi.mocked(prisma.bug.findUnique) as unknown as ReturnType<typeof vi.fn>;

function existingBug(overrides: Record<string, unknown> = {}) {
  return {
    id: "bug-1",
    repositoryUrl: "https://github.com/acme/web",
    reporterId: "reporter-1",
    isDeleted: false,
    project: { repoUrl: "https://github.com/acme/web.git" },
    ...overrides,
  };
}

function save(repositoryUrl: string) {
  const formData = new FormData();
  formData.set("repositoryUrl", repositoryUrl);
  return editRepositoryAction("bug-1", formData);
}

describe("editRepositoryAction (#1047)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves the issue to another repository, recorded and published", async () => {
    findBugMock.mockResolvedValue(existingBug());
    expect(await save("https://github.com/acme/api.git")).toEqual({ ok: true });
    expect(tx.bug.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "bug-1" }, data: expect.objectContaining({ repositoryUrl: "https://github.com/acme/api" }) }),
    );
    expect(tx.bugActivity.create.mock.calls[0]![0].data).toMatchObject({
      summary: "changed the repository to https://github.com/acme/api",
      metadata: { fields: ["repositoryUrl"], from: "https://github.com/acme/web", to: "https://github.com/acme/api" },
    });
    expect(publishWebEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "issue.updated", payload: expect.objectContaining({ changed: ["repositoryUrl"] }) }),
    );
  });

  it("goes back to the project's repository when cleared", async () => {
    findBugMock.mockResolvedValue(existingBug({ repositoryUrl: "https://github.com/acme/api" }));
    expect(await save("")).toEqual({ ok: true });
    expect(tx.bug.update.mock.calls[0]![0].data.repositoryUrl).toBe("https://github.com/acme/web");
  });

  it("does nothing when nothing changed", async () => {
    findBugMock.mockResolvedValue(existingBug());
    expect(await save("https://github.com/acme/web/")).toEqual({ ok: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a value that isn't a repository, next to the field", async () => {
    findBugMock.mockResolvedValue(existingBug());
    expect(await save("https://github.com/acme/web/pull/12")).toMatchObject({ field: "repositoryUrl" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("only lets the reporter or an admin change it", async () => {
    findBugMock.mockResolvedValue(existingBug({ reporterId: "someone-else" }));
    expect(await save("https://github.com/acme/api")).toEqual({ error: TICKET_EDIT_ERRORS.unauthorized });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
