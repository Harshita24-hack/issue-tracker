// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BulkCheckbox, BulkSelectionProvider, CLEAR_VALUE } from "./bulk-selection";
import { bulkUpdateBugsAction } from "@/app/actions/issues-bulk";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/actions/issues-bulk", () => ({
  bulkUpdateBugsAction: vi.fn(),
}));

const mockBulkUpdate = vi.mocked(bulkUpdateBugsAction);

const mockTypes = [{ id: "t1", name: "Bug" }, { id: "t2", name: "Feature" }];
const mockPlatforms = [{ id: "p1", name: "Web" }, { id: "p2", name: "Mobile" }];
const mockUsers = [{ id: "u1", name: "Alice" }, { id: "u2", name: "Bob" }];

function renderWithSelection(selectedIds: string[] = ["bug-1", "bug-2"]) {
  const result = render(
    <BulkSelectionProvider
      pageIds={["bug-1", "bug-2", "bug-3"]}
      types={mockTypes}
      platforms={mockPlatforms}
      users={mockUsers}
    >
      <div>
        <BulkCheckbox id="bug-1" title="Bug 1" />
        <BulkCheckbox id="bug-2" title="Bug 2" />
        <BulkCheckbox id="bug-3" title="Bug 3" />
      </div>
    </BulkSelectionProvider>,
  );

  // Check the checkboxes to simulate selection
  for (const id of selectedIds) {
    const checkbox = screen.getByLabelText(new RegExp(`Select Bug ${id.replace("bug-", "")}`, "i"));
    fireEvent.click(checkbox);
  }

  return result;
}

describe("BulkSelection clear actions (#719)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("offers explicit Unassigned, No platform, and No type options in dropdowns", () => {
    renderWithSelection();

    const typeSelect = screen.getByRole("combobox", { name: /set type/i });
    const platformSelect = screen.getByRole("combobox", { name: /set platform/i });
    const assigneeSelect = screen.getByRole("combobox", { name: /set assignee/i });

    // Verify Type options
    const typeOptionTexts = Array.from(typeSelect.querySelectorAll("option")).map((o) => o.textContent);
    expect(typeOptionTexts).toContain("No type");

    // Verify Platform options
    const platformOptionTexts = Array.from(platformSelect.querySelectorAll("option")).map((o) => o.textContent);
    expect(platformOptionTexts).toContain("No platform");

    // Verify Assignee options
    const assigneeOptionTexts = Array.from(assigneeSelect.querySelectorAll("option")).map((o) => o.textContent);
    expect(assigneeOptionTexts).toContain("Unassigned");

    // Verify Status and Severity do not have clear options
    const statusSelect = screen.getByRole("combobox", { name: /set status/i });
    const statusOptionTexts = Array.from(statusSelect.querySelectorAll("option")).map((o) => o.textContent);
    expect(statusOptionTexts).not.toContain("No status");

    const severitySelect = screen.getByRole("combobox", { name: /set severity/i });
    const severityOptionTexts = Array.from(severitySelect.querySelectorAll("option")).map((o) => o.textContent);
    expect(severityOptionTexts).not.toContain("No severity");
  });

  it("maps 'No type' selection to empty-string clear value when calling bulkUpdateBugsAction", async () => {
    mockBulkUpdate.mockResolvedValueOnce({ ok: true, updated: 2 });
    renderWithSelection(["bug-1", "bug-2"]);

    const typeSelect = screen.getByRole("combobox", { name: /set type/i });
    fireEvent.change(typeSelect, { target: { value: CLEAR_VALUE } });

    await waitFor(() => {
      expect(mockBulkUpdate).toHaveBeenCalledWith(["bug-1", "bug-2"], { typeId: "" });
    });
  });

  it("maps 'No platform' selection to empty-string clear value when calling bulkUpdateBugsAction", async () => {
    mockBulkUpdate.mockResolvedValueOnce({ ok: true, updated: 2 });
    renderWithSelection(["bug-1", "bug-2"]);

    const platformSelect = screen.getByRole("combobox", { name: /set platform/i });
    fireEvent.change(platformSelect, { target: { value: CLEAR_VALUE } });

    await waitFor(() => {
      expect(mockBulkUpdate).toHaveBeenCalledWith(["bug-1", "bug-2"], { categoryId: "" });
    });
  });

  it("maps 'Unassigned' selection to empty-string clear value when calling bulkUpdateBugsAction", async () => {
    mockBulkUpdate.mockResolvedValueOnce({ ok: true, updated: 2 });
    renderWithSelection(["bug-1", "bug-2"]);

    const assigneeSelect = screen.getByRole("combobox", { name: /set assignee/i });
    fireEvent.change(assigneeSelect, { target: { value: CLEAR_VALUE } });

    await waitFor(() => {
      expect(mockBulkUpdate).toHaveBeenCalledWith(["bug-1", "bug-2"], { assigneeId: "" });
    });
  });

  it("does not call bulkUpdateBugsAction when placeholder option is selected", async () => {
    renderWithSelection(["bug-1"]);

    const assigneeSelect = screen.getByRole("combobox", { name: /set assignee/i });
    fireEvent.change(assigneeSelect, { target: { value: "" } });

    expect(mockBulkUpdate).not.toHaveBeenCalled();
  });

  it("preserves actual values when normal option is selected", async () => {
    mockBulkUpdate.mockResolvedValueOnce({ ok: true, updated: 1 });
    renderWithSelection(["bug-1"]);

    const assigneeSelect = screen.getByRole("combobox", { name: /set assignee/i });
    fireEvent.change(assigneeSelect, { target: { value: "u1" } });

    await waitFor(() => {
      expect(mockBulkUpdate).toHaveBeenCalledWith(["bug-1"], { assigneeId: "u1" });
    });
  });
});
