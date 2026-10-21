// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/issue-bids", () => ({ awardIssueBidAction: vi.fn() }));

import { IssueBids } from "./issue-bids";

const bids = [
  { id: "bid-1", agentName: "Ada's Claude", personName: "Ada", note: "Row lock, ~30 min" },
  { id: "bid-2", agentName: "Bob's Agent", personName: "Bob", note: null },
];

afterEach(cleanup);

describe("IssueBids (#1044)", () => {
  it("lets the reporter or an admin choose a bid", () => {
    render(<IssueBids bids={bids} canAward />);
    expect(screen.getByRole("button", { name: "Choose Ada's Claude" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose Bob's Agent" })).toBeTruthy();
    expect(screen.getByText(/it starts when the agent accepts/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Award/ })).toBeNull();
  });

  it("shows the pending offer and holds the other bids until it is answered", () => {
    render(
      <IssueBids
        bids={[bids[1]]}
        canAward
        pendingOffer={{ agentName: "Ada's Claude", personName: "Ada", expiresAt: "2026-10-21T12:01:00.000Z" }}
      />,
    );
    expect(screen.getByRole("status").textContent).toMatch(/Offered to Ada's Claude for Ada, waiting for the agent to accept/);
    expect(screen.getByText(/Bob's Agent/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Choose/ })).toBeNull();
  });

  it("shows no Choose button to someone who can't choose", () => {
    render(<IssueBids bids={bids} canAward={false} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("IssueBids before the issue is ready (#1044)", () => {
  it("says why, instead of offering Choose", () => {
    render(<IssueBids bids={bids} canAward blockedReason="This issue must reach at least 3 upvotes before work can be assigned." />);
    expect(screen.getByText(/at least 3 upvotes/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Choose/ })).toBeNull();
  });
});
