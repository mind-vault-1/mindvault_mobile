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

describe("ContentViewer format detection edge cases", () => {
  it("treats empty and whitespace-only content as text", () => {
    expect(detectContentFormat("")).toBe("text");
    expect(detectContentFormat("   \n ")).toBe("text");
  });

  it("detects JSON arrays and rejects malformed JSON-looking text", () => {
    expect(detectContentFormat("[1, 2, 3]")).toBe("json");
    expect(detectContentFormat("[not json")).toBe("text");
  });

  it("detects list, quote, code-fence and link markdown", () => {
    expect(detectContentFormat("- one\n- two")).toBe("markdown");
    expect(detectContentFormat("> quoted")).toBe("markdown");
    expect(detectContentFormat("```\ncode\n```")).toBe("markdown");
    expect(detectContentFormat("see [docs](https://example.com)")).toBe("markdown");
  });
});

describe("ContentViewer markdown rendering", () => {
  const Linking = jest.requireActual("react-native").Linking;

  it("renders list items, quotes, inline code and italics", () => {
    const screen = renderWithProviders(
      <ContentViewer content={"- first item\n1. second item\n> a quote\nSome `code` and _emphasis_"} />
    );

    expect(screen.getByText(/first item/)).toBeTruthy();
    expect(screen.getByText(/second item/)).toBeTruthy();
    expect(screen.getByText("a quote")).toBeTruthy();
    expect(screen.getByText("code")).toBeTruthy();
    expect(screen.getByText("emphasis")).toBeTruthy();
  });

  it("opens http(s) links and swallows a failure to open them", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("nope"));
    const screen = renderWithProviders(<ContentViewer content="Read [the docs](https://example.com/docs)" />);

    fireEvent.press(screen.getByRole("link"));
    await waitFor(() => expect(openURL).toHaveBeenCalledWith("https://example.com/docs"));
    openURL.mockRestore();
  });

  it("does not make non-http links pressable", () => {
    const screen = renderWithProviders(<ContentViewer content="Click [here](ftp://example.com/file)" />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("[here](ftp://example.com/file)")).toBeTruthy();
  });
});

describe("ContentViewer explicit format and size handling", () => {
  it("honours an explicit format over detection", () => {
    const screen = renderWithProviders(<ContentViewer content='{"a":1}' format="text" />);

    expect(screen.getByText('{"a":1}')).toBeTruthy();
  });

  it("falls back to the raw text when forced JSON is invalid", () => {
    const screen = renderWithProviders(<ContentViewer content="{oops" format="json" />);

    expect(screen.getByText("{oops")).toBeTruthy();
  });

  it("does not offer Show more at exactly the preview limit", () => {
    const screen = renderWithProviders(<ContentViewer content={"z".repeat(CONTENT_PREVIEW_CHARS)} />);

    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(screen.getByText("z".repeat(CONTENT_PREVIEW_CHARS))).toBeTruthy();
  });

  it("shows an ellipsis-terminated preview of large content", () => {
    const longContent = "a".repeat(CONTENT_PREVIEW_CHARS + 500);
    const screen = renderWithProviders(<ContentViewer content={longContent} />);

    expect(screen.getByText(`${"a".repeat(CONTENT_PREVIEW_CHARS)}…`)).toBeTruthy();
  });

  it("truncates large pretty-printed JSON by its formatted length", () => {
    const content = JSON.stringify({ items: Array.from({ length: 400 }, (_, i) => i) });
    const screen = renderWithProviders(<ContentViewer content={content} />);

    expect(screen.getByRole("button", { name: "Show more" })).toBeTruthy();
  });

  it("collapses again when the content changes", () => {
    const first = "x".repeat(CONTENT_PREVIEW_CHARS + 50);
    const second = "y".repeat(CONTENT_PREVIEW_CHARS + 50);
    const screen = renderWithProviders(<ContentViewer content={first} />);
    fireEvent.press(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();

    screen.rerender(<ContentViewer content={second} />);

    expect(screen.getByRole("button", { name: "Show more" })).toBeTruthy();
    expect(screen.queryByText(second)).toBeNull();
  });
});

describe("ContentViewer copy", () => {
  it("copies pretty-printed JSON", async () => {
    const screen = renderWithProviders(<ContentViewer content='{"a":1}' />);

    fireEvent.press(screen.getByRole("button", { name: "Copy content" }));

    await waitFor(() => expect(mockSetString).toHaveBeenCalledWith('{\n  "a": 1\n}'));
  });

  it("reports a clipboard failure", async () => {
    mockSetString.mockRejectedValueOnce(new Error("denied"));
    const screen = renderWithProviders(<ContentViewer content="hello" />);

    fireEvent.press(screen.getByRole("button", { name: "Copy content" }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Unable to copy content"));
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});
