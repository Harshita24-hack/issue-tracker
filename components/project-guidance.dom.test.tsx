// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MasterGuidanceEditor } from "./project-guidance-editor";
import { GuidanceNotesList } from "./project-guidance-notes-list";

vi.mock("@/app/(app)/projects/[slug]/guidance/actions", () => ({
  updateMasterGuidanceAction: vi.fn(),
  createGuidanceNoteAction: vi.fn(),
  upvoteGuidanceNoteAction: vi.fn(),
  acceptGuidanceNoteAction: vi.fn(),
}));

describe("MasterGuidanceEditor", () => {
  it("renders the master guidance markdown and last updated time", () => {
    render(
      <MasterGuidanceEditor
        slug="web"
        initialBody="# Project Architecture Rules\nFollow strict types."
        isAdmin={true}
        updatedAt={new Date("2026-10-22T12:00:00Z")}
      />,
    );

    expect(screen.getByText("Master Project Guidance")).toBeDefined();
    expect(screen.getByText(/Project Architecture Rules/)).toBeDefined();
    expect(screen.getByText("Edit Master Guidance")).toBeDefined();
  });
});

describe("GuidanceNotesList", () => {
  it("renders list of notes with category, upvotes, and author", () => {
    const notes = [
      {
        id: "note-1",
        category: "setup",
        title: "Docker instructions",
        body: "Run pnpm prisma generate first.",
        upvotes: 7,
        status: "pending",
        acceptedAt: null,
        createdAt: new Date("2026-10-22T10:00:00Z"),
        authorAgent: { id: "agent-1", name: "Quantum-Agent" },
        authorUser: null,
      },
    ];

    render(
      <GuidanceNotesList
        slug="web"
        initialNotes={notes}
        isAdmin={true}
      />,
    );

    expect(screen.getByText("Shared Notes & Learnings")).toBeDefined();
    expect(screen.getByText("SETUP")).toBeDefined();
    expect(screen.getByText("Docker instructions")).toBeDefined();
    expect(screen.getByText("7")).toBeDefined();
    expect(screen.getByText("Fold into Master")).toBeDefined();
  });
});
