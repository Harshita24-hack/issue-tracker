// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, afterEach } from "vitest";
import { IssueActivityPanel } from "./issue-activity-panel";
import type { ActivityEntry } from "./activity-timeline";

afterEach(() => cleanup());

const mockActivities: ActivityEntry[] = [
  {
    id: "act-1",
    type: "created",
    summary: "reported this issue",
    createdAt: new Date("2026-10-15T12:00:00Z"),
    actor: { name: "Alice" },
  },
  {
    id: "act-2",
    type: "status_changed",
    summary: "changed status from open to in_progress",
    createdAt: new Date("2026-10-15T13:00:00Z"),
    actor: { name: "Bob" },
    metadata: { note: "Starting work on this bug now." },
  },
];

describe("IssueActivityPanel (#1066)", () => {
  it("renders the trigger button with the count of activities", () => {
    render(<IssueActivityPanel activities={mockActivities} totalCount={2} />);

    const trigger = screen.getByRole("button", { name: /View activity \(2\)/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");

    // Dialog is initially closed
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the activity side panel when the button is clicked and shows timeline items", () => {
    render(<IssueActivityPanel activities={mockActivities} totalCount={2} />);

    const trigger = screen.getByRole("button", { name: /View activity \(2\)/i });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");

    expect(screen.getByRole("heading", { name: "Activity (2)" })).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("reported this issue")).toBeInTheDocument();
    expect(screen.getByText("changed status from open to in_progress")).toBeInTheDocument();
    expect(screen.getByText("Starting work on this bug now.")).toBeInTheDocument();
  });

  it("closes when the close button is clicked", () => {
    render(<IssueActivityPanel activities={mockActivities} totalCount={2} />);

    fireEvent.click(screen.getByRole("button", { name: /View activity \(2\)/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: /Close activity panel/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when Escape key is pressed", () => {
    render(<IssueActivityPanel activities={mockActivities} totalCount={2} />);

    fireEvent.click(screen.getByRole("button", { name: /View activity \(2\)/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("displays trimmed text when totalCount is greater than activities.length", () => {
    render(<IssueActivityPanel activities={mockActivities.slice(0, 1)} totalCount={5} />);

    fireEvent.click(screen.getByRole("button", { name: /View activity \(5\)/i }));

    expect(
      screen.getByText(/Showing the 1 most recent of 5\./i)
    ).toBeInTheDocument();
  });
});
