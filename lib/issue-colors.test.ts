import { describe, expect, it } from "vitest";
import { getCategoryColor, platformPillClass } from "./issue-colors";

describe("getCategoryColor", () => {
  it("returns the same color for the same name regardless of case", () => {
    expect(getCategoryColor("Design")).toEqual(getCategoryColor("design"));
  });

  it("always returns a dot and pill class", () => {
    const color = getCategoryColor("Marketing");
    expect(color.dot).toMatch(/^bg-/);
    expect(color.pill).toContain("text-");
  });
});

describe("platformPillClass", () => {
  it("covers every platform", () => {
    expect(Object.keys(platformPillClass).sort()).toEqual([
      "api_backend",
      "desktop",
      "mobile",
      "web",
    ]);
  });
});
