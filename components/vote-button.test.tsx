// @vitest-environment jsdom
"use client";

import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { toggleVoteAction } from "@/app/actions/issues";
import { VoteButton } from "./vote-button";

vi.mock("@/app/actions/issues", () => ({
  toggleVoteAction: vi.fn(),
}));

const mockedToggleVote = vi.mocked(toggleVoteAction);

afterEach(() => cleanup());

const serverResult = {
  ok: true,
  voteCount: 3,
  likeCount: 3,
  dislikeCount: 0,
  userVote: 1,
  voted: true,
};

function renderVoteButton(
  props: Partial<Parameters<typeof VoteButton>[0]> = {},
) {
  return render(<VoteButton bugId="b1" voteCount={2} {...props} />);
}

function likeButton() {
  return screen.getByRole("button", {
    name: /^(Upvote this issue|Upvoted)/,
  }) as HTMLButtonElement;
}

function countOf(button: HTMLElement) {
  return within(button).getByText(/\d+/);
}

describe("VoteButton optimistic update and rollback", () => {
  beforeEach(() => {
    mockedToggleVote.mockReset();
    mockedToggleVote.mockResolvedValue(serverResult);
  });

  it("applies the vote optimistically, disables while pending, then reconciles with the server", async () => {
    mockedToggleVote.mockImplementationOnce(() =>
      new Promise((resolve) => {
        setTimeout(() => resolve(serverResult), 20);
      }),
    );

    renderVoteButton();
    const like = likeButton();

    expect(countOf(like).textContent).toBe("2");
    expect(like.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(like);

    // Optimistic update is immediate: count goes up, button is pressed.
    expect(countOf(like).textContent).toBe("3");
    expect(like.getAttribute("aria-pressed")).toBe("true");
    // The transition keeps the button disabled while the action is in flight.
    expect(like.disabled).toBe(true);

    await waitFor(() => expect(mockedToggleVote).toHaveBeenCalledWith("b1", 1));

    // Server values replace the optimistic ones once the action resolves
    // and the transition settles.
    await waitFor(() => {
      expect(like.disabled).toBe(false);
      expect(countOf(like).textContent).toBe("3");
      expect(mockedToggleVote).toHaveBeenCalledTimes(1);
    });
  });

  it("rolls back the optimistic update when the action returns an error", async () => {
    mockedToggleVote.mockResolvedValueOnce({ error: "Vote failed" });

    renderVoteButton();
    const like = likeButton();

    fireEvent.click(like);

    expect(countOf(like).textContent).toBe("3");
    expect(like.getAttribute("aria-pressed")).toBe("true");

    // Rolled back to the pre-click state once the transition settles.
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Vote failed");
      expect(countOf(like).textContent).toBe("2");
      expect(like.getAttribute("aria-pressed")).toBe("false");
      expect(like.disabled).toBe(false);
    });
  });

  it("toggles off an existing like", async () => {
    mockedToggleVote.mockResolvedValueOnce({
      ok: true,
      voteCount: 1,
      likeCount: 1,
      dislikeCount: 0,
      userVote: 0,
      voted: false,
    });

    // userVote=1 with voteCount=2 seeds likeCount=2.
    renderVoteButton({ userVote: 1 });
    const like = likeButton();

    expect(like.getAttribute("aria-pressed")).toBe("true");
    expect(countOf(like).textContent).toBe("2");

    fireEvent.click(like);

    await waitFor(() => expect(mockedToggleVote).toHaveBeenCalledWith("b1", 1));

    // "Upvoted" → toggled off → "Upvote this issue"
    expect(like.getAttribute("aria-pressed")).toBe("false");
    expect(countOf(like).textContent).toBe("1");
  });

  it("turns an old dislike into an upvote with one click (#1059)", async () => {
    mockedToggleVote.mockResolvedValueOnce({
      ok: true,
      voteCount: 2,
      likeCount: 2,
      dislikeCount: 0,
      userVote: 1,
      voted: true,
    });

    renderVoteButton({ userVote: -1, likeCount: 1 });
    const like = likeButton();
    expect(like.getAttribute("aria-pressed")).toBe("false");
    expect(countOf(like).textContent).toBe("1");

    fireEvent.click(like);

    await waitFor(() => expect(mockedToggleVote).toHaveBeenCalledWith("b1", 1));
    expect(countOf(like).textContent).toBe("2");
    expect(like.getAttribute("aria-pressed")).toBe("true");
  });

  it.each(["sm", "md", "inline"] as const)("offers no downvote or Dislike (%s, #1059)", (size) => {
    renderVoteButton({ size });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /dislike|downvote/i })).toBeNull();
  });
});

describe("VoteButton large size accessible name", () => {
  it("starts with the text it shows, so speech users can say what they see", () => {
    const { unmount } = render(<VoteButton bugId="b1" voteCount={2} size="md" />);
    const button = screen.getByRole("button", { name: /^Upvote 2 votes$/ });
    expect(button.textContent?.replace(/\s+/g, " ").trim()).toBe("Upvote 2");
    unmount();
    render(<VoteButton bugId="b1" voteCount={3} userVote={1} size="md" />);
    expect(screen.getByRole("button", { name: /^Upvoted 3 votes, click to remove your vote$/ })).toBeTruthy();
  });
});

describe("VoteButton inline size (#452)", () => {
  beforeEach(() => {
    mockedToggleVote.mockReset();
    mockedToggleVote.mockResolvedValue(serverResult);
  });

  it("shows a thumbs-up with the count and no Upvote label or avatars", () => {
    renderVoteButton({ size: "inline", likeCount: 4 });
    const like = likeButton();
    expect(like.textContent?.trim()).toBe("4");
    expect(like.querySelector("svg")).toBeTruthy();
    expect(screen.queryByText(/Upvoted|Work unlocked|to unlock work/)).toBeNull();
  });

  it("toggles the vote, exposes aria-pressed and updates the count without a reload", async () => {
    renderVoteButton({ size: "inline" });
    const like = likeButton();
    expect(like.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(like);
    expect(like.getAttribute("aria-pressed")).toBe("true");
    expect(countOf(like).textContent).toBe("3");
    await waitFor(() => expect(mockedToggleVote).toHaveBeenCalledWith("b1", 1));
  });

  it("is a native button, so Enter and Space work from the keyboard", () => {
    renderVoteButton({ size: "inline" });
    const like = likeButton();
    expect(like.tagName).toBe("BUTTON");
    expect(like.getAttribute("type")).toBe("button");
    like.focus();
    expect(document.activeElement).toBe(like);
  });

  it("cannot be changed on a deleted issue", () => {
    renderVoteButton({ size: "inline", readOnly: true });
    expect(likeButton().disabled).toBe(true);
  });
});
