// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  setEmail: vi.fn(),
  setKind: vi.fn(),
}));
vi.mock("@/app/actions/settings", () => ({
  setEmailNotificationsAction: actions.setEmail,
  setNotificationKindAction: actions.setKind,
}));

import { NotificationSettings } from "./notification-settings";

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

const initialPrefs = {
  notifyMentions: true,
  notifyAssignments: true,
  notifyStatusChanges: true,
};

describe("NotificationSettings rejected saves", () => {
  it("rolls back and reports a rejected master-switch save", async () => {
    const user = userEvent.setup();
    actions.setEmail.mockRejectedValueOnce(new Error("offline"));
    render(<NotificationSettings initialEnabled initialPrefs={initialPrefs} />);

    const toggle = screen.getByRole("checkbox", { name: /Email me about activity/ });
    await user.click(toggle);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save email notification setting");
    expect(toggle).toBeChecked();
  });

  it("rolls back and reports a rejected per-kind save", async () => {
    const user = userEvent.setup();
    actions.setKind.mockRejectedValueOnce(new Error("offline"));
    render(<NotificationSettings initialEnabled initialPrefs={initialPrefs} />);

    const toggle = screen.getByRole("checkbox", { name: /Mentions/ });
    await user.click(toggle);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save notification setting");
    expect(toggle).toBeChecked();
  });
});
