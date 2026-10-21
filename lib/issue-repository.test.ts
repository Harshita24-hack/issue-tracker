import { describe, expect, it } from "vitest";
import { issueRepositoryUrl, normalizeRepositoryUrl, repositoryUrlSchema } from "./issue-repository";

describe("normalizeRepositoryUrl (#1047)", () => {
  it.each([
    ["https://github.com/acme/web", "https://github.com/acme/web"],
    ["https://github.com/acme/web/", "https://github.com/acme/web"],
    ["https://github.com/acme/web.git", "https://github.com/acme/web"],
    ["  https://github.com/acme/web  ", "https://github.com/acme/web"],
    ["git@github.com:acme/web.git", "https://github.com/acme/web"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeRepositoryUrl(raw)).toBe(expected);
  });

  it.each([
    "https://github.com/acme/web/pull/12",
    "https://github.com/acme",
    "https://gitlab.com/acme/web",
    "https://github.com/acme/web?tab=readme",
    "not a url",
    "",
  ])("refuses %s", (raw) => {
    expect(normalizeRepositoryUrl(raw)).toBeNull();
  });
});

describe("repositoryUrlSchema (#1047)", () => {
  it("treats blank as not given, and normalises a repository", () => {
    expect(repositoryUrlSchema.parse("")).toBeUndefined();
    expect(repositoryUrlSchema.parse(null)).toBeUndefined();
    expect(repositoryUrlSchema.parse("https://github.com/acme/web.git")).toBe("https://github.com/acme/web");
  });

  it("explains a wrong value", () => {
    const result = repositoryUrlSchema.safeParse("https://github.com/acme/web/pull/3");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/GitHub repository URL/);
  });
});

describe("issueRepositoryUrl (#1047)", () => {
  it("prefers the issue's own repository, then the project's", () => {
    expect(issueRepositoryUrl({ repositoryUrl: "https://github.com/acme/api", project: { repoUrl: "https://github.com/acme/web" } }))
      .toBe("https://github.com/acme/api");
    expect(issueRepositoryUrl({ repositoryUrl: null, project: { repoUrl: "https://github.com/acme/web.git" } }))
      .toBe("https://github.com/acme/web");
    expect(issueRepositoryUrl({ repositoryUrl: null, project: null })).toBeNull();
  });
});
