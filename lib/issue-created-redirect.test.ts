import { describe, expect, it } from "vitest";
import { isIssueCreatedRedirect } from "./issue-created-redirect";

const redirect = (url: string) => ({ digest: `NEXT_REDIRECT;replace;${url};307;` });

describe("isIssueCreatedRedirect", () => {
  it("accepts the redirect to the created issue page", () => {
    expect(isIssueCreatedRedirect(redirect("/issues/abc123"))).toBe(true);
  });

  it("rejects a redirect to the login page so the draft is kept", () => {
    expect(isIssueCreatedRedirect(redirect("/login"))).toBe(false);
  });

  it("rejects redirects to other issue routes and external URLs", () => {
    expect(isIssueCreatedRedirect(redirect("/issues"))).toBe(false);
    expect(isIssueCreatedRedirect(redirect("/issues/abc/edit"))).toBe(false);
    expect(isIssueCreatedRedirect(redirect("https://example.com/issues/abc"))).toBe(false);
  });

  it("rejects ordinary errors and non-errors", () => {
    expect(isIssueCreatedRedirect(new Error("boom"))).toBe(false);
    expect(isIssueCreatedRedirect({ digest: 42 })).toBe(false);
    expect(isIssueCreatedRedirect(null)).toBe(false);
    expect(isIssueCreatedRedirect(undefined)).toBe(false);
  });
});
