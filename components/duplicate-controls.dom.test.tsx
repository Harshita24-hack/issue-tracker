// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * #1023: the duplicate search kept the previous query's rows during the 200ms
 * debounce, so pressing Enter after editing the query could mark the wrong
 * issue as a duplicate — an admin write that is awkward to undo.
 */

const findDuplicateCandidatesAction = vi.fn();
const markDuplicateAction = vi.fn();

vi.mock("@/app/actions/duplicates", () => ({
  findDuplicateCandidatesAction: (bugId: string, query: string) =>
    findDuplicateCandidatesAction(bugId, query),
  markDuplicateAction: (bugId: string, ref: string) => markDuplicateAction(bugId, ref),
  clearDuplicateAction: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({ useToast: () => vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { MarkDuplicateButton } from "./duplicate-controls";

const payment = { id: "bug_pay", number: 12, title: "Payment fails at checkout", status: "open" as const };
const auth = { id: "bug_auth", number: 34, title: "Auth loop on refresh", status: "open" as const };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function openPanel() {
  render(<MarkDuplicateButton bugId="bug_1" />);
  fireEvent.click(screen.getByRole("button", { name: "Mark as duplicate" }));
  return screen.getByLabelText("Duplicate of which issue?") as HTMLInputElement;
}

describe("MarkDuplicateButton stale results (#1023)", () => {
  it("clears the previous query's rows as soon as the query changes", async () => {
    findDuplicateCandidatesAction.mockResolvedValue([payment]);
    const input = openPanel();

    fireEvent.change(input, { target: { value: "payment" } });
    await waitFor(() => expect(screen.getByText("Payment fails at checkout")).toBeTruthy());

    // Edit the query; before the debounce elapses the old row must be gone.
    fireEvent.change(input, { target: { value: "auth" } });

    expect(screen.queryByText("Payment fails at checkout")).toBeNull();
  });

  it("does not let Enter mark the stale issue after the query changes", async () => {
    findDuplicateCandidatesAction.mockImplementation(async (_bugId: string, query: string) =>
      query.trim() === "payment" ? [payment] : [auth],
    );
    const input = openPanel();

    fireEvent.change(input, { target: { value: "payment" } });
    await waitFor(() => expect(screen.getByText("Payment fails at checkout")).toBeTruthy());

    // Change the query and press Enter immediately, mid-debounce.
    fireEvent.change(input, { target: { value: "auth" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // The old single result must not be chosen.
    expect(markDuplicateAction).not.toHaveBeenCalled();
  });

  it("marks the issue matching the current query once results arrive", async () => {
    markDuplicateAction.mockResolvedValue({ ok: true });
    findDuplicateCandidatesAction.mockResolvedValue([auth]);
    const input = openPanel();

    fireEvent.change(input, { target: { value: "auth" } });
    await waitFor(() => expect(screen.getByText("Auth loop on refresh")).toBeTruthy());

    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(markDuplicateAction).toHaveBeenCalledWith("bug_1", "bug_auth");
    });
  });
});
