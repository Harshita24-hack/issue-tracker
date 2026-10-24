// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  meetsWcagAA,
  contrastMismatches,
  relativeLuminance,
} from "./contrast";

describe("WCAG 2.1 Color Contrast", () => {
  it("calculates correct relative luminance for black and white", () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0);
    expect(relativeLuminance(255, 255, 255)).toBe(1);
  });

  it("calculates exact black-on-white contrast ratio of 21:1", () => {
    const ratio = contrastRatio("#000000", "#ffffff");
    expect(ratio).toBeCloseTo(21, 1);
  });

  it("calculates identical colors as 1:1", () => {
    expect(contrastRatio("#123456", "#123456")).toBe(1);
    expect(meetsWcagAA(1)).toBe(false);
  });

  describe("Token-level design palette checks (#638)", () => {
    // Semantic tokens from app/globals.css
    const PALETTE_PAIRS = [
      { name: "ok (emerald)", fg: "#146c43", bg: "#e3f6ec", min: 4.5 },
      { name: "bad (red)", fg: "#a3261a", bg: "#fde8e4", min: 4.5 },
      { name: "warn (amber)", fg: "#7a4e00", bg: "#fdf3d7", min: 4.5 },
      { name: "info (blue)", fg: "#1d4fb8", bg: "#e7f0ff", min: 4.5 },
      { name: "text on light canvas", fg: "#15121f", bg: "#f5f7fc", min: 4.5 },
      { name: "text on card surface", fg: "#15121f", bg: "#ffffff", min: 4.5 },
      { name: "text2 on card surface", fg: "#3e4a63", bg: "#ffffff", min: 4.5 },
    ];

    for (const pair of PALETTE_PAIRS) {
      it(`palette token pair ${pair.name} meets ${pair.min}:1 contrast`, () => {
        const ratio = contrastRatio(pair.fg, pair.bg);
        expect(ratio, `contrast ratio for ${pair.name} (${pair.fg} on ${pair.bg})`).toBeGreaterThanOrEqual(
          pair.min,
        );
      });
    }
  });

  describe("DOM contrast scanner", () => {
    it("passes for high-contrast pairs (e.g. text-slate-700 on white)", () => {
      const div = document.createElement("div");
      div.className = "bg-white";
      div.innerHTML = `<p class="text-slate-700">Readable text</p>`;

      const mismatches = contrastMismatches(div);
      expect(mismatches).toEqual([]);
    });

    it("fails on deliberately low-contrast pair fixture (text-slate-300 on white) (#638 criterion 4)", () => {
      const div = document.createElement("div");
      div.className = "bg-white";
      div.innerHTML = `<span class="text-slate-300">Hard to read text</span>`;

      const mismatches = contrastMismatches(div);
      expect(mismatches.length).toBe(1);
      expect(mismatches[0].textColor).toBe("#cbd5e1"); // slate-300
      expect(mismatches[0].backgroundColor).toBe("#ffffff"); // white
      expect(mismatches[0].ratio).toBeLessThan(4.5);
      expect(mismatches[0].message).toContain("below WCAG AA required 4.5:1");
    });
  });
});
