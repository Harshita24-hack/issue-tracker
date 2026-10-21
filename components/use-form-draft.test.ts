// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFormDraft } from "./use-form-draft";
import { clearUserDrafts } from "@/lib/form-drafts";

describe("useFormDraft unmount and debounce cleanup (#1169)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("cancels pending save on unmount so cleared storage is not recreated", () => {
    const key = "draft:user-1:bug:new";
    const { result, unmount } = renderHook(() =>
      useFormDraft(key, { title: "" }, { debounceMs: 500 }),
    );

    // Schedule a save via setValue
    act(() => {
      result.current.setValue("title", "Abandoned draft");
    });

    // Unmount before debounce fires
    unmount();

    // Clear user's drafts as logout does
    clearUserDrafts("user-1");
    expect(window.localStorage.getItem(key)).toBeNull();

    // Advance timers past debounceMs
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Storage must still be empty!
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("cancels pending save when draft key changes", () => {
    let key = "draft:user-1:bug:new:proj-1";
    const { result, rerender } = renderHook(
      ({ currentKey }) =>
        useFormDraft(currentKey, { title: "" }, { debounceMs: 500 }),
      { initialProps: { currentKey: key } },
    );

    // Schedule a save for proj-1
    act(() => {
      result.current.setValue("title", "Project 1 draft");
    });

    // Change key to proj-2 before timer fires
    key = "draft:user-1:bug:new:proj-2";
    rerender({ currentKey: key });

    // Advance timers
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // The abandoned key for proj-1 must not have been written to storage
    expect(window.localStorage.getItem("draft:user-1:bug:new:proj-1")).toBeNull();
  });

  it("repeated edits replace an earlier pending timer", () => {
    const key = "draft:user-1:bug:new";
    const { result } = renderHook(() =>
      useFormDraft(key, { title: "" }, { debounceMs: 500 }),
    );

    act(() => {
      result.current.setValue("title", "Edit 1");
    });

    // Advance 300ms (not yet fired)
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Make second edit
    act(() => {
      result.current.setValue("title", "Edit 2");
    });

    // Advance 300ms more (600ms total, but 300ms since Edit 2)
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Should not have fired with Edit 1
    expect(window.localStorage.getItem(key)).toBeNull();

    // Advance remaining 200ms
    act(() => {
      vi.advanceTimersByTime(200);
    });

    const stored = window.localStorage.getItem(key);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).values.title).toBe("Edit 2");
  });

  it("cancels pending save on explicit discard immediately before timeout", () => {
    const key = "draft:user-1:bug:new";
    const { result } = renderHook(() =>
      useFormDraft(key, { title: "" }, { debounceMs: 500 }),
    );

    act(() => {
      result.current.setValue("title", "To discard");
    });

    act(() => {
      vi.advanceTimersByTime(499);
    });

    // Discard right before timer fires
    act(() => {
      result.current.discardDraft();
    });

    act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(window.localStorage.getItem(key)).toBeNull();
  });
});
