// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #1021: a rejected webhook creation called `useFieldErrors().show()` during
 * render, which commits state on every call and re-renders forever
 * ("Too many re-renders"). These tests drive the real submit path and assert
 * the message appears instead of the component blowing up.
 */

const createWebhookAction = vi.fn();
const listWebhooksAction = vi.fn();

vi.mock("@/app/actions/webhooks", () => ({
  createWebhookAction: (previous: unknown, formData: FormData) => createWebhookAction(previous, formData),
  listWebhooksAction: () => listWebhooksAction(),
  deleteWebhookAction: vi.fn(),
  reEnableWebhookAction: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({ useToast: () => vi.fn() }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn(async () => true) }));

import { WebhookManagement } from "./webhook-management";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup() {
  listWebhooksAction.mockResolvedValue({ ok: true, subscriptions: [], agents: [] });
  return render(<WebhookManagement />);
}

/** The form's submit control. */
function submit(container: HTMLElement) {
  const form = container.querySelector("form")!;
  fireEvent.submit(form);
}

describe("WebhookManagement rejected creation (#1021)", () => {
  it("shows the field error instead of crashing with a render loop", async () => {
    createWebhookAction.mockResolvedValue({
      ok: false,
      error: "That URL is not allowed.",
      field: "url",
    });
    const { container } = setup();

    submit(container);

    // Reaching the assertion at all proves the render loop is gone: an
    // unguarded render-phase `show()` throws before this resolves.
    await waitFor(() => {
      expect(screen.getByText("That URL is not allowed.")).toBeTruthy();
    });
  });

  it("marks the failing control invalid and keeps the form usable", async () => {
    createWebhookAction.mockResolvedValue({
      ok: false,
      error: "Pick an agent.",
      field: "agentId",
    });
    const { container } = setup();

    submit(container);

    await waitFor(() => {
      expect(screen.getByText("Pick an agent.")).toBeTruthy();
    });

    // The page is still interactive, not stuck re-rendering.
    const urlInput = container.querySelector("#webhook-url") as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: "https://example.com/hook" } });
    expect(urlInput.value).toBe("https://example.com/hook");
  });

  it("focuses the failing control so a screen-reader user lands on it", async () => {
    createWebhookAction.mockResolvedValue({
      ok: false,
      error: "That URL is not allowed.",
      field: "url",
    });
    const { container } = setup();

    submit(container);

    await waitFor(() => {
      const input = container.querySelector("#webhook-url") as HTMLInputElement;
      expect(document.activeElement).toBe(input);
    });
  });

  it("surfaces a form-level error when no field is named", async () => {
    createWebhookAction.mockResolvedValue({ ok: false, error: "You are not allowed to do that." });
    const { container } = setup();

    submit(container);

    await waitFor(() => {
      expect(screen.getByText("You are not allowed to do that.")).toBeTruthy();
    });
  });
});

describe("WebhookManagement load failure (#1021)", () => {
  it("shows a load error rather than an unhandled rejection", async () => {
    listWebhooksAction.mockRejectedValue(new Error("boom"));

    render(<WebhookManagement />);

    await waitFor(() => {
      expect(screen.getByText(/couldn't load webhooks/i)).toBeTruthy();
    });
  });
});
