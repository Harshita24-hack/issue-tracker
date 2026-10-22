// @vitest-environment jsdom
"use client";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectAgentSetupCard } from "./project-agent-setup-card";
import * as clipboard from "@/lib/clipboard";

const mockToast = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => mockToast,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  mockToast.mockReset();
});

describe("ProjectAgentSetupCard (#1254)", () => {
  it("renders heading with project name and setup instructions snippet", () => {
    render(
      <ProjectAgentSetupCard
        projectId="proj-alpha-123"
        projectName="Ziki Alpha"
        projectSlug="ziki-alpha"
      />,
    );

    expect(screen.getByRole("heading", { name: /Connect an Agent to Ziki Alpha/i })).toBeDefined();
    expect(screen.getByText(/Agent Setup/i)).toBeDefined();
    expect(screen.getByTestId("copy-agent-setup-button")).toBeDefined();

    // Verify snippet contents
    const snippetPre = screen.getByText(/You are my Ziki agent for project "Ziki Alpha"/i);
    expect(snippetPre).toBeDefined();
    expect(snippetPre.textContent).toContain("ID: proj-alpha-123");
    expect(snippetPre.textContent).toContain('your first question to me MUST strictly be: "Can I start working?"');
  });

  it("copies agent setup snippet when copy button is clicked", async () => {
    const copySpy = vi.spyOn(clipboard, "copyText").mockResolvedValue(true);

    render(
      <ProjectAgentSetupCard
        projectId="proj-alpha-123"
        projectName="Ziki Alpha"
        projectSlug="ziki-alpha"
      />,
    );

    const button = screen.getByTestId("copy-agent-setup-button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(copySpy).toHaveBeenCalledWith(
        expect.stringContaining('You are my Ziki agent for project "Ziki Alpha" (ID: proj-alpha-123)'),
      );
      expect(mockToast).toHaveBeenCalledWith("Agent setup instructions copied to clipboard.");
    });
  });

  it("copies project id when copy id button is clicked", async () => {
    const copySpy = vi.spyOn(clipboard, "copyText").mockResolvedValue(true);

    render(
      <ProjectAgentSetupCard
        projectId="proj-alpha-123"
        projectName="Ziki Alpha"
        projectSlug="ziki-alpha"
      />,
    );

    const copyIdButton = screen.getByTestId("copy-project-id-button");
    fireEvent.click(copyIdButton);

    await waitFor(() => {
      expect(copySpy).toHaveBeenCalledWith("proj-alpha-123");
      expect(mockToast).toHaveBeenCalledWith("Project ID copied to clipboard.");
    });
  });

  it("collapses and expands the snippet when toggle button is clicked", () => {
    render(
      <ProjectAgentSetupCard
        projectId="proj-alpha-123"
        projectName="Ziki Alpha"
        projectSlug="ziki-alpha"
      />,
    );

    const toggleButton = screen.getByTestId("toggle-snippet-button");
    expect(screen.getByTestId("agent-snippet-container")).toBeDefined();

    // Collapse
    fireEvent.click(toggleButton);
    expect(screen.queryByTestId("agent-snippet-container")).toBeNull();

    // Expand
    fireEvent.click(toggleButton);
    expect(screen.getByTestId("agent-snippet-container")).toBeDefined();
  });
});
