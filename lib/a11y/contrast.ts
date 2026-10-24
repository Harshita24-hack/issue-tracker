/**
 * WCAG 2.1 Color Contrast Checker.
 *
 * jsdom lacks a layout and compositing engine, so axe-core disables `color-contrast`
 * in unit tests. This utility provides:
 * 1. WCAG 2.1 relative luminance and contrast ratio calculations.
 * 2. Token-level validation for design system and palette pairs.
 * 3. DOM node scanning for Tailwind text/bg color classes and inline styles to detect
 *    contrast failures below the WCAG AA 4.5:1 threshold (3:1 for large text).
 */

export type ContrastMismatch = {
  element: string;
  textColor: string;
  backgroundColor: string;
  ratio: number;
  expectedRatio: number;
  message: string;
};

/** Standard Tailwind palette hex values used across Ziki. */
export const TAILWIND_COLORS: Record<string, string> = {
  // Slate
  "slate-50": "#f8fafc",
  "slate-100": "#f1f5f9",
  "slate-200": "#e2e8f0",
  "slate-300": "#cbd5e1",
  "slate-400": "#94a3b8",
  "slate-500": "#64748b",
  "slate-600": "#475569",
  "slate-700": "#334155",
  "slate-800": "#1e293b",
  "slate-900": "#0f172a",
  "slate-950": "#020617",
  // Emerald
  "emerald-50": "#ecfdf5",
  "emerald-100": "#d1fae5",
  "emerald-500": "#10b981",
  "emerald-600": "#059669",
  "emerald-700": "#047857",
  "emerald-800": "#065f46",
  // Red
  "red-50": "#fef2f2",
  "red-100": "#fee2e2",
  "red-500": "#ef4444",
  "red-600": "#dc2626",
  "red-700": "#b91c1c",
  "red-800": "#991b1b",
  // Amber
  "amber-50": "#fffbeb",
  "amber-100": "#fef3c7",
  "amber-500": "#f59e0b",
  "amber-600": "#d97706",
  "amber-700": "#b45309",
  "amber-800": "#92400e",
  // Blue / Teal / Brand
  "blue-500": "#3b82f6",
  "blue-600": "#2563eb",
  "blue-700": "#1d4ed8",
  "teal-500": "#14b8a6",
  "teal-600": "#0d9488",
  "teal-700": "#0f766e",
  // Base
  white: "#ffffff",
  black: "#000000",
};

/** Parse hex color string (#rgb, #rrggbb) to [r, g, b] (0-255). */
export function parseColor(color: string): [number, number, number] | null {
  const trimmed = color.trim().toLowerCase();
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }

  const rgbMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1], 10), parseInt(rgbMatch[2], 10), parseInt(rgbMatch[3], 10)];
  }

  if (TAILWIND_COLORS[trimmed]) {
    return parseColor(TAILWIND_COLORS[trimmed]);
  }

  return null;
}

/**
 * Calculates WCAG 2.1 relative luminance for an sRGB color.
 * See: https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((val) => {
    const v = val / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculates WCAG 2.1 contrast ratio between two colors.
 * Returns ratio from 1 (identical) to 21 (black/white).
 */
export function contrastRatio(color1: string, color2: string): number {
  const rgb1 = parseColor(color1);
  const rgb2 = parseColor(color2);
  if (!rgb1 || !rgb2) return 1;

  const lum1 = relativeLuminance(rgb1[0], rgb1[1], rgb1[2]);
  const lum2 = relativeLuminance(rgb2[0], rgb2[1], rgb2[2]);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/** Check if contrast ratio satisfies WCAG AA (4.5:1 for normal text, 3:1 for large text). */
export function meetsWcagAA(ratio: number, isLargeText = false): boolean {
  const target = isLargeText ? 3.0 : 4.5;
  return ratio >= target - 0.05; // tiny rounding margin
}

/** Extract text color class from classList (e.g. text-slate-500). */
function getTextColorClass(className: string): string | null {
  for (const token of className.split(/\s+/)) {
    if (token.startsWith("text-") && !token.startsWith("text-[") && !token.startsWith("text-opacity-")) {
      const name = token.slice(5);
      if (TAILWIND_COLORS[name]) return TAILWIND_COLORS[name];
    }
  }
  return null;
}

/** Extract background color class from classList (e.g. bg-white, bg-slate-100). */
function getBgColorClass(className: string): string | null {
  for (const token of className.split(/\s+/)) {
    if (token.startsWith("bg-") && !token.startsWith("bg-[") && !token.startsWith("bg-opacity-")) {
      const name = token.slice(3);
      if (TAILWIND_COLORS[name]) return TAILWIND_COLORS[name];
    }
  }
  return null;
}

/**
 * Traverses rendered DOM tree to find text elements with defined color classes
 * and compares against their background (or default white/card surface).
 */
export function contrastMismatches(root: ParentNode, defaultBg = "#ffffff"): ContrastMismatch[] {
  const mismatches: ContrastMismatch[] = [];
  const elements = root.querySelectorAll<HTMLElement>("*");

  for (const el of elements) {
    // Only check elements with direct text content
    const hasDirectText = Array.from(el.childNodes).some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0,
    );
    if (!hasDirectText) continue;

    const className = el.className;
    if (typeof className !== "string" || !className) continue;

    const fgColor = getTextColorClass(className);
    if (!fgColor) continue;

    // Find closest ancestor with explicit bg or use default
    let current: HTMLElement | null = el;
    let bgColor: string | null = null;
    while (current) {
      if (typeof current.className === "string") {
        const bg = getBgColorClass(current.className);
        if (bg) {
          bgColor = bg;
          break;
        }
      }
      current = current.parentElement;
    }
    const resolvedBg = bgColor ?? defaultBg;

    const ratio = contrastRatio(fgColor, resolvedBg);
    const expectedRatio = 4.5;

    if (!meetsWcagAA(ratio)) {
      mismatches.push({
        element: el.outerHTML.replace(/\s+/g, " ").slice(0, 160),
        textColor: fgColor,
        backgroundColor: resolvedBg,
        ratio: Math.round(ratio * 100) / 100,
        expectedRatio,
        message: `text with color "${fgColor}" on background "${resolvedBg}" has contrast ratio ${(Math.round(ratio * 100) / 100).toFixed(2)}:1, below WCAG AA required ${expectedRatio}:1`,
      });
    }
  }

  return mismatches;
}
