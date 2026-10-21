// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ setKeyboardShortcuts: vi.fn() }));
vi.mock("@/app/actions/settings", () => ({
  setKeyboardShortcutsAction: actions.setKeyboardShortcuts,
}));
vi.mock("@/components/keyboard-shortcuts", () => ({
  ShowShortcutsButton: () => <button type="button">Show shortcuts</button>,
}));

import { KeyboardShortcutSettings } from "./keyboard-shortcut-settings";

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("KeyboardShortcutSettings rejected saves", () => {
  it("rolls back and reports a rejected save", async () => {
    const user = userEvent.setup();
    actions.setKeyboardShortcuts.mockRejectedValueOnce(new Error("offline"));
    render(<KeyboardShortcutSettings initialEnabled={false} />);

    const toggle = screen.getByRole("checkbox", { name: "Use keyboard shortcuts" });
    await user.click(toggle);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save keyboard shortcut setting");
    expect(toggle).not.toBeChecked();
  });
});
