/**
 * Issue reference parsing (#457).
 *
 * Agent API callers may reference an issue by its readable number (`123`,
 * `ZE-123`) or by its internal database id. This module normalizes either
 * form into a discriminated object so the caller can build the right query.
 */

export type IssueRef =
  | { kind: "number"; number: number }
  | { kind: "id"; id: string };

const ZEDU_PREFIX_RE = /^ze[-_]?/i;

/**
 * Parse an issue ref passed to an agent API route. Recognizes:
 *  - `123`, `ZE-123`, `ZE_123` → a readable bug number
 *  - a 21+ character cuid-like id → treated as an internal id
 *
 * Any other shape is reported as a bad number so the route can return 422
 * rather than silently returning 404.
 */
export function parseIssueRef(input: string): IssueRef {
  const trimmed = input.trim();
  const withPrefix = ZEDU_PREFIX_RE.exec(trimmed);
  if (withPrefix) {
    // `ZE-123` style: strip prefix and parse the remainder.
    const num = Number(trimmed.slice(withPrefix[0].length));
    if (Number.isInteger(num) && num > 0) return { kind: "number", number: num };
    throw new IssueRefError(`Invalid issue number "${trimmed}".`);
  }
  // Plain number like `123`.
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    if (num > 0) return { kind: "number", number: num };
    throw new IssueRefError(`Invalid issue number "${trimmed}".`);
  }
  // Otherwise treat as an opaque id (cuid-like).
  if (trimmed.length >= 21 && /^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return { kind: "id", id: trimmed };
  }
  throw new IssueRefError(`Invalid issue id "${trimmed}".`);
}

export class IssueRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IssueRefError";
  }
}