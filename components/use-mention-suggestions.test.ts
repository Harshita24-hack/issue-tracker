// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { createElement, type KeyboardEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMentionSuggestions } from "./use-mention-suggestions";
import { MarkdownEditor } from "./markdown-editor";

afterEach(cleanup);

function setup() {
  const onChange = vi.fn();
  const { result } = renderHook(() => useMentionSuggestions({
    users: [{ id: "ada", name: "Ada" }, { id: "alan", name: "Alan" }],
    value: "@a",
    onChange,
    textareaRef: { current: null },
  }));
  act(() => result.current.sync("@a", 2));
  return { result, onChange };
}

function keyEvent(key: string, nativeEvent = {}) {
  return { key, nativeEvent, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLTextAreaElement>;
}

describe("mention composition keys (#757)", () => {
  it.each([{ isComposing: true }, { keyCode: 229 }])("skips editor shortcuts during composition (%j)", (composition) => {
    const onChange = vi.fn();
    const { getByRole } = render(createElement(MarkdownEditor, {
      value: "@a", onChange, users: [{ id: "ada", name: "Ada" }],
    }));
    const textarea = getByRole("textbox");
    fireEvent.keyDown(textarea, { key: " ", ctrlKey: true, ...composition });
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(["Enter", "Tab", "ArrowDown", "ArrowUp", "Escape"])("leaves composing %s untouched", (key) => {
    const { result, onChange } = setup();
    const event = keyEvent(key, { isComposing: true });
    act(() => expect(result.current.handleKeyDown(event)).toBe(false));
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.showSuggestions).toBe(true);
    expect(result.current.activeIndex).toBe(0);
  });

  it("also ignores the IME key code when isComposing is false", () => {
    const { result, onChange } = setup();
    const event = keyEvent("Enter", { isComposing: false, keyCode: 229 });
    act(() => expect(result.current.handleKeyDown(event)).toBe(false));
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.showSuggestions).toBe(true);
  });

  it("keeps ordinary navigation and selection after composition", () => {
    const { result, onChange } = setup();
    act(() => result.current.handleKeyDown(keyEvent("Enter", { isComposing: true })));
    act(() => result.current.handleKeyDown(keyEvent("ArrowDown")));
    expect(result.current.activeIndex).toBe(1);
    const event = keyEvent("Enter");
    act(() => expect(result.current.handleKeyDown(event)).toBe(true));
    expect(event.preventDefault).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith("@[Alan](alan) ");
    expect(result.current.showSuggestions).toBe(false);
  });
});

describe("moving between mention spans and selection clamping (#1171)", () => {
  const users = [
    { id: "ada", name: "Ada" },
    { id: "alan", name: "Alan" },
    { id: "bob", name: "Bob" },
  ];

  it.each(["Enter", "Tab"])("resets activeIndex when moving caret to a different mention span and inserts with %s", (key) => {
    const onChange = vi.fn();
    const text = "@a @bo";
    const { result } = renderHook(() =>
      useMentionSuggestions({
        users,
        value: text,
        onChange,
        textareaRef: { current: null },
      }),
    );

    // Place caret at '@a' (caret index 2)
    act(() => result.current.sync(text, 2));
    expect(result.current.suggestions.map((u) => u.name)).toEqual(["Ada", "Alan"]);
    expect(result.current.activeIndex).toBe(0);

    // Highlight Alan with ArrowDown
    act(() => {
      const event = keyEvent("ArrowDown");
      result.current.handleKeyDown(event);
    });
    expect(result.current.activeIndex).toBe(1);

    // Caret moved to '@bo' (caret index 6) via click/selection without resetIndex
    act(() => result.current.sync(text, 6, false));
    expect(result.current.suggestions.map((u) => u.name)).toEqual(["Bob"]);
    expect(result.current.activeIndex).toBe(0);

    // Press Enter or Tab to confirm selection of Bob
    const confirmEvent = keyEvent(key);
    act(() => expect(result.current.handleKeyDown(confirmEvent)).toBe(true));
    expect(confirmEvent.preventDefault).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith("@a @[Bob](bob) ");
  });

  it("preserves activeIndex on keyup within the same span (#201)", () => {
    const onChange = vi.fn();
    const text = "@a";
    const { result } = renderHook(() =>
      useMentionSuggestions({
        users,
        value: text,
        onChange,
        textareaRef: { current: null },
      }),
    );

    act(() => result.current.sync(text, 2));
    expect(result.current.activeIndex).toBe(0);

    // ArrowDown moves highlight to Alan (index 1)
    act(() => {
      result.current.handleKeyDown(keyEvent("ArrowDown"));
    });
    expect(result.current.activeIndex).toBe(1);

    // keyup event calls sync without resetIndex within the same span
    act(() => result.current.sync(text, 2, false));
    expect(result.current.activeIndex).toBe(1);

    // Pressing Enter still inserts Alan
    const enterEvent = keyEvent("Enter");
    act(() => expect(result.current.handleKeyDown(enterEvent)).toBe(true));
    expect(onChange).toHaveBeenCalledWith("@[Alan](alan) ");
  });

  it("clamps activeIndex when user list changes while open", () => {
    let currentUsers = users; // Ada, Alan, Bob
    const onChange = vi.fn();
    const text = "@";
    const { result, rerender } = renderHook(() =>
      useMentionSuggestions({
        users: currentUsers,
        value: text,
        onChange,
        textareaRef: { current: null },
      }),
    );

    act(() => result.current.sync(text, 1));
    expect(result.current.suggestions).toHaveLength(3);

    // Move to last item (Bob, index 2)
    act(() => {
      result.current.handleKeyDown(keyEvent("ArrowDown"));
      result.current.handleKeyDown(keyEvent("ArrowDown"));
    });
    expect(result.current.activeIndex).toBe(2);

    // User list dynamically changes to only Ada
    currentUsers = [{ id: "ada", name: "Ada" }];
    rerender();

    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.activeIndex).toBe(0);

    const enterEvent = keyEvent("Enter");
    act(() => expect(result.current.handleKeyDown(enterEvent)).toBe(true));
    expect(onChange).toHaveBeenCalledWith("@[Ada](ada) ");
  });

  it("handles no matches without crashing or consuming Enter", () => {
    const onChange = vi.fn();
    const text = "@xyz";
    const { result } = renderHook(() =>
      useMentionSuggestions({
        users,
        value: text,
        onChange,
        textareaRef: { current: null },
      }),
    );

    act(() => result.current.sync(text, 4));
    expect(result.current.suggestions).toHaveLength(0);
    expect(result.current.showSuggestions).toBe(false);

    const enterEvent = keyEvent("Enter");
    act(() => expect(result.current.handleKeyDown(enterEvent)).toBe(false));
    expect(enterEvent.preventDefault).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("resets index after closing and reopening", () => {
    const onChange = vi.fn();
    const text = "@a";
    const { result } = renderHook(() =>
      useMentionSuggestions({
        users,
        value: text,
        onChange,
        textareaRef: { current: null },
      }),
    );

    act(() => result.current.sync(text, 2));
    act(() => {
      result.current.handleKeyDown(keyEvent("ArrowDown"));
    });
    expect(result.current.activeIndex).toBe(1);

    // Close suggestions (e.g. Escape or close())
    act(() => result.current.close());
    expect(result.current.showSuggestions).toBe(false);

    // Reopen
    act(() => result.current.sync(text, 2));
    expect(result.current.showSuggestions).toBe(true);
    expect(result.current.activeIndex).toBe(0);
  });
});
