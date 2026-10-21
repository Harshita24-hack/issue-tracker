// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/app/actions/comments", () => ({ deleteCommentAction: vi.fn(), updateCommentAction: vi.fn() }));
vi.mock("@/components/comment-form", () => ({ CommentForm: () => null }));

import { CommentTypeBadge } from "./comment-thread";

afterEach(cleanup);

/** #1045: validations, merges and escalations show their type in the conversation. */
describe("CommentTypeBadge", () => {
  it("labels a validation with its verdict", () => {
    render(<CommentTypeBadge type="validation" metadata={{ verdict: "accept" }} />);
    expect(screen.getByText("Validation")).toBeTruthy();
    expect(screen.getByText("· accept")).toBeTruthy();
  });

  it("labels a merge and links its pull request", () => {
    render(<CommentTypeBadge type="merge" metadata={{ pullRequestUrl: "https://github.com/acme/web/pull/42" }} />);
    expect(screen.getByText("Merge")).toBeTruthy();
    expect(screen.getByRole("link", { name: "PR" }).getAttribute("href")).toBe("https://github.com/acme/web/pull/42");
  });

  it("links a delivery's validated pullRequestUrl, and never a link that isn't GitHub", () => {
    render(<CommentTypeBadge type="delivery" metadata={{ pullRequestUrl: "https://github.com/acme/web/pull/7" }} />);
    expect(screen.getByRole("link", { name: "PR" }).getAttribute("href")).toBe("https://github.com/acme/web/pull/7");
    cleanup();
    render(<CommentTypeBadge type="delivery" metadata={{ prUrl: "javascript:alert(1)" }} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("labels an escalation", () => {
    render(<CommentTypeBadge type="escalation" />);
    expect(screen.getByText("Escalation")).toBeTruthy();
  });
});
