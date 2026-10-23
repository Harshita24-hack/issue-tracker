# ENDOR-454: Return 422 for invalid limit on /api/v1/issues and /api/v1/feed

## Problem

`GET /api/v1/issues?limit=<value>` and `GET /api/v1/feed?limit=<value>` silently accepted invalid `limit` values (negative numbers, zero, non-integers like "abc" or "5px"), replacing them with the default page size (25) without notifying the client. Other bad inputs on the same routes (bad cursor, bad projectId, bad from on points) correctly returned 400/422 errors, but limit was silently ignored.

- `GET /api/v1/issues?projectId=id&limit=0` → 200, 25 items (silently ignored)
- `GET /api/v1/issues?projectId=id&limit=-5` → 200, 25 items (silently ignored)
- `GET /api/v1/issues?projectId=id&limit=abc` → 200, 25 items (silently ignored)
- `GET /api/v1/feed?limit=0` → 200, 25 items (silently ignored)

Expected: Any `limit` value that is not a valid positive integer between 1 and MAX_PAGE_SIZE should return **422 Unprocessable Entity** with a clear error message.

## Fix

### `lib/agent-api/create-policy.ts`

Added `parseLimitStrict()` function that validates `?limit=` values strictly:

- Returns the clamped limit when valid (1–MAX_PAGE_SIZE)
- Returns `{ ok: false, error: "limit must be an integer between 1 and MAX_PAGE_SIZE." }` when invalid
- Rejects non-integer strings, negative numbers, zero, and values exceeding MAX_PAGE_SIZE

Updated `pageSize()` to remain as the clamping fallback for internal use.

### `lib/agent-api/issues.ts`

- `listAgentIssues()`: Now uses `parseLimitStrict()` instead of `pageSize()`. If the limit is invalid, throws `IssueApiError(422, ...)` before any database query runs.
- `listAgentIssueComments()`: Same strict validation for comment listing.

### `app/api/v1/feed/route.ts`

- `GET /api/v1/feed`: Now validates `limit` via `parseLimitStrict()`. Invalid values throw `IssueApiError(422)` before the feed is fetched.
- Error handling added to catch `IssueApiError` and return the proper status code.

### `lib/feed.ts`

- `readFeed()`: Now accepts an optional `limit` parameter (defaults to `FEED_PAGE_SIZE`). Passes the validated limit through to the Prisma query.

## Verification

- `vitest run lib/agent-api/issues.test.ts` — all 52 tests pass
- `vitest run app/api/v1/issues/route.test.ts` — all tests pass
- `vitest run app/api/v1/feed/route.test.ts` — all 6 tests pass
- `corepack pnpm exec tsc --noEmit` — type clean
- `corepack pnpm lint` — 0 errors, 4 pre-existing warnings

## Files Changed

- `lib/agent-api/create-policy.ts` — added `parseLimitStrict()`
- `lib/agent-api/issues.ts` — strict limit validation in `listAgentIssues` and `listAgentIssueComments`
- `app/api/v1/feed/route.ts` — strict limit validation and error handling
- `lib/feed.ts` — `readFeed()` accepts optional `limit` parameter
- `app/api/v1/feed/route.test.ts` — updated test expectation for new `readFeed` signature