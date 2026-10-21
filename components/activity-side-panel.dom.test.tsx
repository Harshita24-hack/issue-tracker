// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ActivitySidePanel } from "./activity-side-panel";
import type { ActivityEntry } from "./activity-timeline";

afterEach(() => {
  cleanup();
});

vi.mock("./activity-timeline", () => ({
  ActivityTimeline: ({ activities, totalCount }: { activities: any[]; totalCount: number }) => (
    <div data-testid="mock-timeline">
      Timeline count: {totalCount}, entries: {activities.length}
    </div>
  ),
}));

describe("ActivitySidePanel (#1051)", () => {
  const sampleActivities: ActivityEntry[] = [
    {
      id: "act-1",
      type: "status_changed",
      summary: "changed status to in_progress",
      createdAt: new Date("2026-10-21T10:00:00Z"),
      actor: { name: "Alice Developer" },
    },
  ];

  it("renders trigger button with count and closed panel initially", () => {
    render(<ActivitySidePanel activities={sampleActivities} totalCount={1} />);

    const trigger = screen.getByRole("button", { name: /View activity \(1\)/i });
    expect(trigger).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Activity timeline" })).not.toBeInTheDocument();
  });

  it("opens slide-over panel on click and renders ActivityTimeline inside", () => {
    render(<ActivitySidePanel activities={sampleActivities} totalCount={1} />);

    const trigger = screen.getByRole("button", { name: /View activity \(1\)/i });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Activity timeline" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId("mock-timeline")).toHaveTextContent("Timeline count: 1, entries: 1");
  });

  it("closes the panel on Escape key", () => {
    render(<ActivitySidePanel activities={sampleActivities} totalCount={1} />);

    const trigger = screen.getByRole("button", { name: /View activity \(1\)/i });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Activity timeline" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Activity timeline" })).not.toBeInTheDocument();
  });

  it("closes the panel on close button click", () => {
    render(<ActivitySidePanel activities={sampleActivities} totalCount={1} />);

    fireEvent.click(screen.getByRole("button", { name: /View activity \(1\)/i }));
    expect(screen.getByRole("dialog", { name: "Activity timeline" })).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: /Close activity panel/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole("dialog", { name: "Activity timeline" })).not.toBeInTheDocument();
  });
});
