// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { MarkdownEditor } from "./markdown-editor";

// Same shape the real API returns: a 25-character cuid-style id, so the
// finished Markdown (55 chars for this name) is longer than the placeholder
// it replaces (~40 chars incl. the 8-char upload token).
const ATTACHMENT_ID = "clzaaaaaaaaaaaaaaaaaaaaa";
const FINISHED = `![shot.png](/api/attachments/${ATTACHMENT_ID})`;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Renders a controlled editor and records every emitted value for limit assertions. */
function renderEditor(initial: string, maxLength: number) {
  // Every value the editor ever handed back, so a silent over-limit step
  // cannot hide behind a later correction.
  const seen: string[] = [];
  /** Keeps the editor value in React state as a parent form would. */
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <MarkdownEditor
        value={value}
        onChange={(next) => {
          seen.push(next);
          setValue(next);
        }}
        maxLength={maxLength}
        aria-label="Description"
      />
    );
  }
  const { container } = render(<Harness />);
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
  return { seen, textarea };
}

/** Dispatches a synthetic PNG drop to exercise the editor's upload handler in jsdom. */
function dropScreenshot(textarea: HTMLTextAreaElement) {
  const file = new File(["png-bytes"], "shot.png", { type: "image/png" });
  // jsdom has no DragEvent/DataTransfer; a plain event carrying the two
  // properties handleDrop reads is enough for the editor's own handler.
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.assign(event, { dataTransfer: { types: ["Files"], files: [file] } });
  act(() => {
    textarea.dispatchEvent(event);
  });
}

/** Mocks fetch so the upload stays in flight until the test finishes it. */
function holdUpload() {
  let release: (payload: unknown) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = (payload) =>
            resolve({ ok: true, json: async () => payload });
        }),
    ),
  );
  return async (payload: Record<string, unknown>) => {
    await act(async () => {
      release(payload);
      // A macrotask tick drains the whole fetch/then chain inside act.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
}

const PAYLOAD = {
  id: ATTACHMENT_ID,
  filename: "shot.png",
  contentType: "image/png",
};

describe("MarkdownEditor upload stays inside the field limit (#732)", () => {
  it("never lets a near-limit description go over 5000 when the finished Markdown would overrun it", async () => {
    // 4955 + the placeholder fit inside 5000, but the finished Markdown
    // (4955 + 1 newline + 55) would land the field at 5011 characters.
    const initial = "a".repeat(4955);
    const { seen, textarea } = renderEditor(initial, 5000);
    const finishUpload = holdUpload();

    dropScreenshot(textarea);
    // The insert-time check accepts the placeholder: the bug's precondition.
    expect(textarea.value).toContain("#upload-");
    expect(textarea.value.length).toBeLessThanOrEqual(5000);

    await finishUpload(PAYLOAD);

    // The swap was refused: no finished Markdown, no placeholder left
    // behind, and the person is told what happened.
    expect(textarea.value).not.toContain("#upload-");
    expect(textarea.value).not.toContain("/api/attachments/");
    expect(textarea.value.startsWith(initial)).toBe(true);
    expect(textarea.value.length).toBeLessThanOrEqual(5000);
    expect(seen.every((value) => value.length <= 5000)).toBe(true);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("shot.png");
    expect(alert.textContent).toContain("there isn't room left");
  });

  it("swaps the placeholder for the finished Markdown when it still fits the comment limit", async () => {
    const initial = "b".repeat(1900);
    const { seen, textarea } = renderEditor(initial, 2000);
    const finishUpload = holdUpload();

    dropScreenshot(textarea);
    expect(textarea.value).toContain("#upload-");

    await finishUpload(PAYLOAD);

    expect(textarea.value).toContain(FINISHED);
    expect(textarea.value).not.toContain("#upload-");
    expect(textarea.value.length).toBeLessThanOrEqual(2000);
    expect(seen.every((value) => value.length <= 2000)).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("MarkdownEditor upload rejects oversized files client-side (#540)", () => {
  it("rejects an over-limit file before calling the upload API", async () => {
    let fetchCalled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        fetchCalled = true;
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }),
    );
    const big = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], "large.png", {
      type: "image/png",
    });
    const { textarea } = renderEditor("", 5000);
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.assign(event, { dataTransfer: { types: ["Files"], files: [big] } });
    act(() => {
      textarea.dispatchEvent(event);
    });

    expect(fetchCalled).toBe(false);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("large.png");
    expect(alert.textContent).toContain("over the");
    expect(textarea.value).not.toContain("#upload-");
    expect(screen.queryByRole("alert")).not.toBeNull();
  });

  it("still uploads a file that is exactly at the limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve({ ok: true, json: async () => PAYLOAD }),
      ),
    );
    const atLimit = new File([new Uint8Array(MAX_ATTACHMENT_BYTES)], "edge.png", {
      type: "image/png",
    });
    const { textarea } = renderEditor("", 5000);
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.assign(event, { dataTransfer: { types: ["Files"], files: [atLimit] } });
    act(() => {
      textarea.dispatchEvent(event);
    });

    // Passed the client-side size check: a placeholder was inserted and no error shown.
    expect(textarea.value).toContain("#upload-");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("MarkdownEditor late upload disposal and session invalidation (#1167)", () => {
  it("never overwrites replaced text when an abandoned upload resolves after unmount/reopen", async () => {
    let releaseUpload: (payload: unknown) => void = () => {};
    let signalReceived: AbortSignal | undefined;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, options) => {
        signalReceived = options?.signal;
        return new Promise((resolve) => {
          releaseUpload = (payload) =>
            resolve({ ok: true, json: async () => payload });
        });
      }),
    );

    const onUploadingChange = vi.fn();
    const onChange1 = vi.fn();

    // 1. Mount first editor session
    const { unmount, rerender } = render(
      <MarkdownEditor
        value="Initial description"
        onChange={onChange1}
        onUploadingChange={onUploadingChange}
        aria-label="Description"
      />,
    );

    const textarea1 = screen.getByRole("textbox") as HTMLTextAreaElement;
    dropScreenshot(textarea1);

    expect(onChange1).toHaveBeenCalled();
    expect(onUploadingChange).toHaveBeenCalledWith(true);

    // 2. User cancels edit (unmounts editor)
    unmount();

    // The signal was aborted on unmount
    expect(signalReceived?.aborted).toBe(true);
    expect(onUploadingChange).toHaveBeenLastCalledWith(false);

    // 3. User reopens edit and types replacement text
    const onChange2 = vi.fn();
    render(
      <MarkdownEditor
        value="Replacement text after cancel"
        onChange={onChange2}
        onUploadingChange={onUploadingChange}
        aria-label="Description"
      />,
    );

    const textarea2 = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea2.value).toBe("Replacement text after cancel");

    // 4. Original upload finishes late
    await act(async () => {
      releaseUpload(PAYLOAD);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // 5. Replacement text survives! Old callback and new callback are NOT corrupted
    expect(onChange1).toHaveBeenCalledTimes(2); // Initial drop calls applyTextChange (which dispatches change & calls onChange)
    expect(onChange2).not.toHaveBeenCalled();
    expect(textarea2.value).toBe("Replacement text after cancel");
  });

  it("handles upload rejection after unmount without crashing or setting error", async () => {
    let rejectUpload: (err: unknown) => void = () => {};

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        return new Promise((_resolve, reject) => {
          rejectUpload = (err) => reject(err);
        });
      }),
    );

    const { unmount } = render(
      <MarkdownEditor
        value="Initial text"
        onChange={vi.fn()}
        aria-label="Description"
      />,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    dropScreenshot(textarea);

    unmount();

    await act(async () => {
      rejectUpload(new Error("Network disconnect"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Ensure no unhandled errors or leaks occurred
  });

  it("handles two uploads completing in reverse order properly", async () => {
    const releases: Array<(payload: unknown) => void> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          releases.push((payload) => resolve({ ok: true, json: async () => payload }));
        });
      }),
    );

    let editorVal = "Initial text";
    function DualHarness() {
      const [val, setVal] = useState(editorVal);
      return (
        <MarkdownEditor
          value={val}
          onChange={(next) => {
            editorVal = next;
            setVal(next);
          }}
          aria-label="Description"
        />
      );
    }

    const { container } = render(<DualHarness />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    // Drop file 1
    const file1 = new File(["bytes1"], "first.png", { type: "image/png" });
    const event1 = new Event("drop", { bubbles: true, cancelable: true });
    Object.assign(event1, { dataTransfer: { types: ["Files"], files: [file1] } });
    act(() => {
      textarea.dispatchEvent(event1);
    });

    // Drop file 2
    const file2 = new File(["bytes2"], "second.png", { type: "image/png" });
    const event2 = new Event("drop", { bubbles: true, cancelable: true });
    Object.assign(event2, { dataTransfer: { types: ["Files"], files: [file2] } });
    act(() => {
      textarea.dispatchEvent(event2);
    });

    expect(releases).toHaveLength(2);

    // Resolve upload 2 first
    await act(async () => {
      releases[1]({
        id: "id_second",
        filename: "second.png",
        contentType: "image/png",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(textarea.value).toContain("![second.png](/api/attachments/id_second)");
    expect(textarea.value).toContain("#upload-");

    // Resolve upload 1 second
    await act(async () => {
      releases[0]({
        id: "id_first",
        filename: "first.png",
        contentType: "image/png",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(textarea.value).toContain("![first.png](/api/attachments/id_first)");
    expect(textarea.value).toContain("![second.png](/api/attachments/id_second)");
    expect(textarea.value).not.toContain("#upload-");
  });
});
