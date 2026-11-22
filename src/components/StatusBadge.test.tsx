import React from "react";
import { render } from "@testing-library/react-native";

import type { StatusBadgeKind } from "./StatusBadge";
import { StatusBadge } from "./StatusBadge";

jest.mock("../theme/ThemeProvider", () => {
  const colors = new Proxy({}, { get: () => "#000000" });
  return {
    useAppTheme: () => ({ colors, shared: { badge: {}, badgeText: {} } }),
  };
});

function renderBadge(kind: StatusBadgeKind, status: string) {
  return render(<StatusBadge kind={kind} status={status} />);
}

describe("StatusBadge", () => {
  it.each<[string, string]>([
    ["verified", "Verification: verified"],
    ["pending", "Verification: pending"],
    ["rejected", "Verification: rejected"],
  ])("labels verification '%s'", (status, label) => {
    const screen = renderBadge("verification", status);
    expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.getByText(status)).toBeTruthy();
  });

  it.each<[string, string]>([
    ["registered", "On-chain: registered"],
    ["pending", "On-chain: pending"],
    ["failed", "On-chain: failed"],
    ["none", "On-chain: not on-chain"],
  ])("labels on-chain '%s'", (status, label) => {
    const screen = renderBadge("onchain", status);
    expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it("shows 'not on-chain' for a resource that is not registered", () => {
    const screen = renderBadge("onchain", "none");
    expect(screen.getByText("not on-chain")).toBeTruthy();
  });

  it.each<[string, string]>([
    ["file", "Type: File"],
    ["link", "Type: Link"],
  ])("labels type '%s'", (status, label) => {
    const screen = renderBadge("type", status);
    expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it("renders an icon next to the text", () => {
    expect(renderBadge("verification", "verified").getByText("✓")).toBeTruthy();
    expect(renderBadge("onchain", "failed").getByText("✗")).toBeTruthy();
  });
});
