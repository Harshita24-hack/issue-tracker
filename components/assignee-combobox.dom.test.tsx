// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssigneeCombobox } from "./assignee-combobox";

afterEach(cleanup);

describe("AssigneeCombobox IME composition (#1170)", () => {
  const people = [
    { id: "u1", name: "田中 太郎", role: "user" as const },
    { id: "u2", name: "佐藤 花子", role: "user" as const },
  ];

  it.each([{ isComposing: true }, { keyCode: 229 }])(
    "ignores Enter during composition (%j) without selecting or closing",
    (composition) => {
      const onChange = vi.fn();
      const { getByRole } = render(
        createElement(AssigneeCombobox, {
          id: "assigneeId",
          name: "assigneeId",
          people,
          onChange,
        }),
      );

      const input = getByRole("combobox");
      // Focus and type to open
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "田中" } });
      expect(input.getAttribute("aria-expanded")).toBe("true");

      // Press Enter during IME composition
      fireEvent.keyDown(input, { key: "Enter", ...composition });

      expect(onChange).not.toHaveBeenCalled();
      expect(input.getAttribute("aria-expanded")).toBe("true");
    },
  );

  it.each([{ isComposing: true }, { keyCode: 229 }])(
    "ignores arrow keys during composition (%j)",
    (composition) => {
      const onChange = vi.fn();
      const { getByRole } = render(
        createElement(AssigneeCombobox, {
          id: "assigneeId",
          name: "assigneeId",
          people,
          onChange,
        }),
      );

      const input = getByRole("combobox");
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "田" } });
      expect(input.getAttribute("aria-expanded")).toBe("true");

      // Try navigating while composing
      fireEvent.keyDown(input, { key: "ArrowDown", ...composition });
      fireEvent.keyDown(input, { key: "ArrowUp", ...composition });

      // Enter during composition should not pick anything
      fireEvent.keyDown(input, { key: "Enter", ...composition });
      expect(onChange).not.toHaveBeenCalled();
      expect(input.getAttribute("aria-expanded")).toBe("true");
    },
  );

  it("selects once when Enter is pressed after composition ends", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      createElement(AssigneeCombobox, {
        id: "assigneeId",
        name: "assigneeId",
        people,
        onChange,
      }),
    );

    const input = getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "田中" } });
    expect(input.getAttribute("aria-expanded")).toBe("true");

    // Enter while composing
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-expanded")).toBe("true");

    // Enter after composition ends
    fireEvent.keyDown(input, { key: "Enter", isComposing: false });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("u1");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });
});
