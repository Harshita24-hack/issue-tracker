// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/app/actions/issues", () => ({
  editBugContentAction: vi.fn(),
  updateBugAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/markdown-editor", () => ({
  MarkdownEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="mock-markdown-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("@/components/assignee-combobox", () => ({
  AssigneeCombobox: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input
      data-testid="mock-assignee-combobox"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("@/components/delete-issue-button", () => ({
  DeleteIssueButton: () => <button type="button">Mock Delete Issue</button>,
}));

import { EditIssueDialog } from "./edit-issue-dialog";

afterEach(() => {
  cleanup();
});

describe("EditIssueDialog (#1051)", () => {
  const defaultProps = {
    bugId: "bug-123",
    initialTitle: "Initial title",
    initialDescription: "Initial description that is long enough",
    status: "open" as const,
    severity: "medium" as const,
    canEditContent: true,
    canEditTriage: true,
    canUpdateStatus: true,
    canDelete: true,
    deletionCounts: { comments: 2, votes: 3 },
    users: [{ id: "u-1", name: "Alice" }],
    categories: [{ id: "cat-1", name: "Web" }],
    types: [{ id: "type-1", name: "Bug" }],
  };

  it("renders trigger button and opens dialog with edit fields and delete button", () => {
    // HTMLDialogElement mock in happy-dom if showModal not present
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function () {
        this.setAttribute("open", "");
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function () {
        this.removeAttribute("open");
      };
    }

    render(<EditIssueDialog {...defaultProps} />);

    const editBtn = screen.getByRole("button", { name: "Edit" });
    expect(editBtn).toBeInTheDocument();

    fireEvent.click(editBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Initial title");
    expect(screen.getByLabelText("Status")).toHaveValue("open");
    expect(screen.getByLabelText("Severity")).toHaveValue("medium");
    expect(screen.getByRole("button", { name: "Mock Delete Issue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });
});
