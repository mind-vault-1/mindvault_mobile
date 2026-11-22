import { ActivityIndicator } from "react-native";
import { fireEvent } from "@testing-library/react-native";

import { getApiBaseUrl } from "../api/resources";
import type { Resource } from "../types";
import { renderWithProviders } from "../test-utils";
import { getResourceThumbnailUri, ResourceCard } from "./ResourceCard";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(undefined) }));

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

function renderCard(resource: Resource) {
  return renderWithProviders(<ResourceCard resource={resource} onCopyUrl={jest.fn()} />);
}

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
