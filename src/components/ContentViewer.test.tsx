import * as Clipboard from "expo-clipboard";
import React from "react";
import { fireEvent, waitFor } from "@testing-library/react-native";

import { renderWithProviders } from "../test-utils";
import {
  CONTENT_PREVIEW_CHARS,
  ContentViewer,
  detectContentFormat,
  formatContent,
} from "./ContentViewer";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn().mockResolvedValue(undefined) }));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock("./ToastProvider", () => ({
  useToast: () => ({ show: jest.fn(), success: mockToastSuccess, error: mockToastError, info: jest.fn() }),
}));

const mockSetString = Clipboard.setStringAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ContentViewer format detection", () => {
  it("detects text, JSON and markdown without throwing on malformed input", () => {
    expect(detectContentFormat("just words")).toBe("text");
    expect(detectContentFormat('{"a":1}')).toBe("json");
    expect(detectContentFormat("# Title\nSome **bold** text")).toBe("markdown");
    expect(detectContentFormat("{oops")).toBe("text");
  });

  it("pretty-prints JSON and leaves other formats unchanged", () => {
    expect(formatContent('{"a":1}', "json")).toBe('{\n  "a": 1\n}');
    expect(formatContent("# Title", "markdown")).toBe("# Title");
    expect(formatContent("{oops", "json")).toBe("{oops");
  });
});

describe("ContentViewer rendering", () => {
  it("renders plain text as selectable text", () => {
    const screen = renderWithProviders(<ContentViewer content="Unlocked content" />);
    expect(screen.getByText("Unlocked content").props.selectable).toBe(true);
    expect(screen.getByLabelText("Unlocked content")).toBeTruthy();
  });

  it("renders pretty-printed JSON as monospace text", () => {
    const screen = renderWithProviders(<ContentViewer content='{"title":"Book","pages":2}' />);
    expect(screen.getByText(/"title": "Book"/)).toBeTruthy();
    expect(screen.getByText(/"pages": 2/)).toBeTruthy();
  });

  it("renders markdown headings, bold text and code blocks", () => {
    const screen = renderWithProviders(
      <ContentViewer content={"# Guide\nSome **bold** text\n```\nconst a = 1;\n```"} />
    );
    expect(screen.getByRole("header").props.children).toBe("Guide");
    expect(screen.getByText("bold")).toBeTruthy();
    expect(screen.getByText("const a = 1;")).toBeTruthy();
  });

  it("truncates large content and restores it with show more", () => {
    const longContent = "x".repeat(CONTENT_PREVIEW_CHARS + 50);
    const screen = renderWithProviders(<ContentViewer content={longContent} />);
    fireEvent.press(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getByText(longContent)).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Show less" }));
    expect(screen.queryByText(longContent)).toBeNull();
  });

  it("copies the full untruncated content", async () => {
    const longContent = "y".repeat(CONTENT_PREVIEW_CHARS + 50);
    const screen = renderWithProviders(<ContentViewer content={longContent} />);
    fireEvent.press(screen.getByRole("button", { name: "Copy content" }));
    await waitFor(() => expect(mockSetString).toHaveBeenCalledWith(longContent));
    expect(mockToastSuccess).toHaveBeenCalledWith("Content copied to clipboard");
  });
});
