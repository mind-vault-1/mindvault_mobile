import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import { prepareRegister, submitRegister } from "../api/resources";
import { ThemeProvider } from "../theme/ThemeProvider";
import type { Resource } from "../types";
import { RegisterModal } from "./RegisterModal";

jest.mock("../api/resources", () => ({
  prepareRegister: jest.fn(),
  submitRegister: jest.fn(),
}));

// Stand-in for the signing sheet: a button that "signs" when the sheet is open.
jest.mock("./SignTransactionSheet", () => {
  const { Pressable, Text } = require("react-native");
  return {
    SignTransactionSheet: ({
      visible,
      onSigned,
    }: {
      visible: boolean;
      onSigned: (signedXdr: string) => void;
    }) =>
      visible ? (
        <Pressable accessibilityLabel="Sign" onPress={() => onSigned("signed-xdr")}>
          <Text>Sign</Text>
        </Pressable>
      ) : null,
  };
});

const mockedPrepare = prepareRegister as jest.Mock;
const mockedSubmit = submitRegister as jest.Mock;

const resource = {
  id: "res-1",
  title: "My Book",
  verificationStatus: "verified",
  onchainStatus: "none",
} as Resource;

it("passes the transaction hash to onSuccess and stays on the success step", async () => {
  mockedPrepare.mockResolvedValue({ unsignedXdr: "unsigned-xdr", networkPassphrase: "Test" });
  mockedSubmit.mockResolvedValue({ txHash: "abc123hash" });
  const onSuccess = jest.fn();
  const screen = render(
    <ThemeProvider>
      <RegisterModal
        visible
        resource={resource}
        onClose={jest.fn()}
        onSuccess={onSuccess}
        onError={jest.fn()}
      />
    </ThemeProvider>
  );

  await act(async () => {
    fireEvent.press(await screen.findByText("Register"));
  });
  await act(async () => {
    fireEvent.press(screen.getByLabelText("Sign"));
  });

  expect(mockedSubmit).toHaveBeenCalledWith("res-1", "signed-xdr");
  expect(onSuccess).toHaveBeenCalledWith("Resource registered on-chain successfully!", "abc123hash");
  expect(screen.getByText("abc123hash")).toBeTruthy();
  expect(screen.getByText("View in Explorer")).toBeTruthy();
});
