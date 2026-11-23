import { ActivityIndicator } from "react-native";
import type { ComponentProps } from "react";
import { fireEvent, waitFor } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";

import { getApiBaseUrl } from "../api/resources";
import type { Resource } from "../types";
import { renderWithProviders } from "../test-utils";
import { act } from "@testing-library/react-native";
import { resetFavoritesForTests } from "../services/favorites";
import { shareResource } from "../utils/shareResource";
import { getResourceThumbnailUri, ResourceCard } from "./ResourceCard";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../utils/shareResource", () => ({ shareResource: jest.fn() }));

const mockedClipboard = Clipboard.setStringAsync as jest.Mock;
const mockedShare = shareResource as jest.Mock;

const base: Resource = {
  id: "res-1",
  title: "Stellar handbook",
  price: "4.50",
  resourceType: "file",
  walletAddress: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7",
  verificationStatus: "verified",
  onchainStatus: "registered",
  listed: true,
  accessUrl: "https://example.com/res-1",
};

type CardProps = Partial<ComponentProps<typeof ResourceCard>>;

function renderCard(resource: Resource, props: CardProps = {}) {
  return renderWithProviders(
    <ResourceCard resource={resource} onCopyUrl={jest.fn()} {...props} />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedShare.mockResolvedValue("shared");
});

describe("thumbnail", () => {
  it("uses the server's thumbnailUrl when one is present", () => {
    const screen = renderCard({
      ...base,
      mimeType: "application/pdf",
      thumbnailUrl: "https://cdn.example.test/thumb.png",
    });

    expect(screen.getByLabelText("Thumbnail of Stellar handbook").props.source).toEqual({
      uri: "https://cdn.example.test/thumb.png",
    });
  });

  it("derives the public endpoint from mimeType for image resources", () => {
    const screen = renderCard({ ...base, id: "res-1", mimeType: "image/png" });

    expect(screen.getByLabelText("Thumbnail of Stellar handbook").props.source).toEqual({
      uri: `${getApiBaseUrl()}/resources/res-1/thumbnail`,
    });
  });

  it("shows nothing for a non-image resource without a thumbnailUrl", () => {
    const screen = renderCard({ ...base, mimeType: "application/pdf" });

    expect(screen.queryByLabelText("Thumbnail of Stellar handbook")).toBeNull();
    expect(screen.queryByLabelText("File icon for Stellar handbook")).toBeNull();
  });

  it("shows a placeholder until the image loads", () => {
    const screen = renderCard({ ...base, mimeType: "image/png" });
    const image = screen.getByLabelText("Thumbnail of Stellar handbook");

    expect(screen.UNSAFE_queryByType(ActivityIndicator)).not.toBeNull();

    fireEvent(image, "load");

    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    expect(screen.getByLabelText("Thumbnail of Stellar handbook")).toBeTruthy();
  });

  it("falls back to the resource-type icon when the image fails to load", () => {
    const screen = renderCard({ ...base, mimeType: "image/png" });

    fireEvent(screen.getByLabelText("Thumbnail of Stellar handbook"), "error");

    expect(screen.queryByLabelText("Thumbnail of Stellar handbook")).toBeNull();
    expect(screen.getByLabelText("File icon for Stellar handbook")).toBeTruthy();
  });
});

describe("getResourceThumbnailUri", () => {
  it("prefers thumbnailUrl over the derived endpoint", () => {
    expect(
      getResourceThumbnailUri({ ...base, mimeType: "image/png", thumbnailUrl: "https://cdn.example.test/t.png" })
    ).toBe("https://cdn.example.test/t.png");
  });

  it("matches image MIME types regardless of case", () => {
    expect(getResourceThumbnailUri({ ...base, mimeType: "IMAGE/JPEG" })).toBe(
      `${getApiBaseUrl()}/resources/res-1/thumbnail`
    );
  });
});

describe("copy and share", () => {
  it("copies the access URL and confirms it through onCopyUrl", async () => {
    const onCopyUrl = jest.fn();
    const screen = renderCard(base, { onCopyUrl });

    fireEvent.press(screen.getByRole("button", { name: "Copy URL for Stellar handbook" }));

    await waitFor(() => expect(mockedClipboard).toHaveBeenCalledWith(base.accessUrl));
    await waitFor(() => expect(onCopyUrl).toHaveBeenCalledWith("Resource URL copied"));
  });

  it("hands the title and URL to the share sheet", async () => {
    const onCopyUrl = jest.fn();
    const screen = renderCard(base, { onCopyUrl });

    fireEvent.press(screen.getByRole("button", { name: "Share Stellar handbook" }));

    await waitFor(() => expect(mockedShare).toHaveBeenCalledWith(base.title, base.accessUrl));
    expect(mockedClipboard).not.toHaveBeenCalled();
    expect(onCopyUrl).not.toHaveBeenCalled();
  });

  it("suggests copying when the share sheet fails", async () => {
    mockedShare.mockResolvedValueOnce("error");
    const onCopyUrl = jest.fn();
    const screen = renderCard(base, { onCopyUrl });

    fireEvent.press(screen.getByRole("button", { name: "Share Stellar handbook" }));

    await waitFor(() =>
      expect(onCopyUrl).toHaveBeenCalledWith(
        "Unable to share resource. Please try copying the URL instead."
      )
    );
  });
});

describe("publisher actions", () => {
  it("keeps a browsing card to copy and share", () => {
    const screen = renderCard(base);

    expect(screen.queryByLabelText("Edit price for Stellar handbook")).toBeNull();
    expect(screen.queryByLabelText("Register Stellar handbook on-chain")).toBeNull();
    expect(screen.queryByLabelText("Transfer ownership of Stellar handbook")).toBeNull();
    expect(screen.queryByLabelText("Delist Stellar handbook")).toBeNull();
  });

  it("opens and closes the price editor", () => {
    const screen = renderCard(base, { editablePrice: true });

    fireEvent.press(screen.getByLabelText("Edit price for Stellar handbook"));
    expect(screen.getByLabelText("New price in USDC").props.value).toBe(base.price);

    fireEvent.press(screen.getByLabelText("Cancel price edit"));

    expect(screen.queryByLabelText("New price in USDC")).toBeNull();
    expect(screen.getByLabelText("Edit price for Stellar handbook")).toBeTruthy();
  });

  it("flags an invalid price inline", () => {
    const screen = renderCard(base, { editablePrice: true });

    fireEvent.press(screen.getByLabelText("Edit price for Stellar handbook"));
    fireEvent.changeText(screen.getByLabelText("New price in USDC"), "");

    expect(screen.getByText("Price cannot be empty.")).toBeTruthy();
  });

  const registerCases: [string, Partial<Resource>, boolean][] = [
    ["a verified resource that isn't on-chain", { onchainStatus: "none" }, true],
    ["a verified resource whose registration failed", { onchainStatus: "failed" }, true],
    ["an already registered resource", { onchainStatus: "registered" }, false],
    ["a resource that isn't verified", { verificationStatus: "pending" }, false],
  ];

  it.each(registerCases)("shows Register for %s", (_case, overrides, shown) => {
    const screen = renderCard({ ...base, ...overrides }, { onRegister: jest.fn() });

    const register = screen.queryByLabelText("Register Stellar handbook on-chain");
    if (shown) expect(register).toBeTruthy();
    else expect(register).toBeNull();
  });

  it("hides Register when no handler is wired up", () => {
    const screen = renderCard({ ...base, onchainStatus: "none" });

    expect(screen.queryByLabelText("Register Stellar handbook on-chain")).toBeNull();
  });

  it("offers transfer and delist only when their handlers are set", () => {
    const screen = renderCard(base, { onTransferOwnership: jest.fn() });

    expect(screen.getByLabelText("Transfer ownership of Stellar handbook")).toBeTruthy();
    expect(screen.queryByLabelText("Delist Stellar handbook")).toBeNull();
  });

  it("passes the resource to the register, transfer and delist handlers", () => {
    const onRegister = jest.fn();
    const onTransferOwnership = jest.fn();
    const onDelist = jest.fn();
    const resource: Resource = { ...base, onchainStatus: "none" };
    const screen = renderCard(resource, { onRegister, onTransferOwnership, onDelist });

    fireEvent.press(screen.getByLabelText("Register Stellar handbook on-chain"));
    fireEvent.press(screen.getByLabelText("Transfer ownership of Stellar handbook"));
    fireEvent.press(screen.getByLabelText("Delist Stellar handbook"));

    expect(onRegister).toHaveBeenCalledWith(resource);
    expect(onTransferOwnership).toHaveBeenCalledWith(resource);
    expect(onDelist).toHaveBeenCalledWith(resource);
  });
});

describe("updates", () => {
  it("renders the new resource when its props change", () => {
    const onCopyUrl = jest.fn();
    const screen = renderWithProviders(<ResourceCard resource={base} onCopyUrl={onCopyUrl} />);
    expect(screen.getByText("4.50 USDC")).toBeTruthy();

    screen.rerender(
      <ResourceCard
        resource={{ ...base, title: "Updated handbook", price: "9.99" }}
        onCopyUrl={onCopyUrl}
      />
    );

    expect(screen.getByText("9.99 USDC")).toBeTruthy();
    expect(screen.getByText("Updated handbook")).toBeTruthy();
    expect(screen.queryByText("Stellar handbook")).toBeNull();
  });

  it("shows the updated price in an open editor when the resource changes", () => {
    const onCopyUrl = jest.fn();
    const screen = renderWithProviders(
      <ResourceCard resource={base} onCopyUrl={onCopyUrl} editablePrice />
    );

    fireEvent.press(screen.getByLabelText("Edit price for Stellar handbook"));
    fireEvent.changeText(screen.getByLabelText("New price in USDC"), "12");

    screen.rerender(
      <ResourceCard resource={{ ...base, price: "7.00" }} onCopyUrl={onCopyUrl} editablePrice />
    );

    expect(screen.getByLabelText("New price in USDC").props.value).toBe("7.00");
  });
});

describe("accessibility", () => {
  it("gives every action a button role and a title-specific label", () => {
    const screen = renderCard(
      { ...base, onchainStatus: "none" },
      {
        editablePrice: true,
        onRegister: jest.fn(),
        onTransferOwnership: jest.fn(),
        onDelist: jest.fn(),
      }
    );

    for (const name of [
      "Share Stellar handbook",
      "Copy URL for Stellar handbook",
      "Edit price for Stellar handbook",
      "Register Stellar handbook on-chain",
      "Transfer ownership of Stellar handbook",
      "Delist Stellar handbook",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("exposes the verification and on-chain badges as labelled text", () => {
    const screen = renderCard(base);

    expect(screen.getByLabelText("Verification: verified")).toBeTruthy();
    expect(screen.getByLabelText("On-chain: registered")).toBeTruthy();
  });

  it("labels the transaction hash and shortens it for display", () => {
    const screen = renderCard({ ...base, onchainTxHash: "ABCDEF1234567890" });

    expect(screen.getByLabelText("Transaction: ABCDEF1234567890")).toBeTruthy();
    expect(screen.getByText("Tx: ABCDEF…7890")).toBeTruthy();
  });
});

describe("favourite toggle", () => {
  beforeEach(() => {
    resetFavoritesForTests();
  });

  it("exposes an accessible toggle that starts unchecked", () => {
    const screen = renderCard(base);
    const heart = screen.getByRole("togglebutton", { name: "Favourite Stellar handbook" });

    expect(heart.props.accessibilityState).toEqual({ checked: false });
  });

  it("flips to checked on press and back on a second press", async () => {
    const screen = renderCard(base);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Favourite Stellar handbook"));
    });
    expect(screen.getByLabelText("Favourite Stellar handbook").props.accessibilityState).toEqual({
      checked: true,
    });

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Favourite Stellar handbook"));
    });
    expect(screen.getByLabelText("Favourite Stellar handbook").props.accessibilityState).toEqual({
      checked: false,
    });
  });

  it("keeps two cards for the same resource in step, but not other resources", async () => {
    const screen = renderWithProviders(
      <>
        <ResourceCard resource={base} onCopyUrl={jest.fn()} />
        <ResourceCard resource={base} onCopyUrl={jest.fn()} />
        <ResourceCard resource={{ ...base, id: "res-2", title: "Other" }} onCopyUrl={jest.fn()} />
      </>
    );

    await act(async () => {
      fireEvent.press(screen.getAllByLabelText("Favourite Stellar handbook")[0]);
    });

    const same = screen.getAllByLabelText("Favourite Stellar handbook");
    expect(same.map((node) => node.props.accessibilityState.checked)).toEqual([true, true]);
    expect(screen.getByLabelText("Favourite Other").props.accessibilityState.checked).toBe(false);
  });
});
