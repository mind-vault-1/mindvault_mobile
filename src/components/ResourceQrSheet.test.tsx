import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import QRCodeGenerator from "qrcode";
import jsQR from "jsqr";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";

import { buildResourceQrValue, ResourceQrSheet } from "./ResourceQrSheet";
import { ToastProvider } from "./ToastProvider";
import { ThemeProvider } from "../theme/ThemeProvider";
import { parseResourceId } from "../utils/resourceLinks";

let mockQrValue = "";
jest.mock("react-native-qrcode-svg", () => {
  const { View } = require("react-native");
  return function MockQr(props: { value: string; getRef?: (r: unknown) => void }) {
    mockQrValue = props.value;
    props.getRef?.({ toDataURL: (cb: (d: string) => void) => cb("data:image/png;base64,BASE64PNG") });
    return <View testID="qr" />;
  };
});
jest.mock("expo-media-library", () => ({
  requestPermissionsAsync: jest.fn(),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("expo-file-system", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64" },
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("../api/resources", () => ({ getApiBaseUrl: () => "https://api.mindvault.test/" }));

const mockPermission = MediaLibrary.requestPermissionsAsync as jest.Mock;

/** Renders the QR matrix to an RGBA bitmap the way a camera frame would see it, then decodes it. */
function scan(text: string): string | null {
  const qr = QRCodeGenerator.create(text, { errorCorrectionLevel: "M" });
  const scale = 6;
  const quiet = 4;
  const modules = qr.modules.size;
  const dim = (modules + quiet * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (!qr.modules.get(y, x)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (x + quiet) * scale + dx;
          const py = (y + quiet) * scale + dy;
          const i = (py * dim + px) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return jsQR(data, dim, dim)?.data ?? null;
}

function renderSheet(onClose = jest.fn()) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ResourceQrSheet visible resourceId="res/1 a" resourceTitle="Guide" onClose={onClose} />
      </ToastProvider>
    </ThemeProvider>
  );
}

beforeEach(() => jest.clearAllMocks());

describe("buildResourceQrValue", () => {
  it("builds the app and web links", () => {
    expect(buildResourceQrValue("abc", "app")).toBe("mindvault://resources/abc");
    expect(buildResourceQrValue("abc", "web", "https://api.test/")).toBe(
      "https://api.test/resources/abc"
    );
  });

  it.each(["app", "web"] as const)("round-trips through the scanner parser (%s)", (mode) => {
    const id = "res/1 a?";
    const value = buildResourceQrValue(id, mode, "https://api.test");
    expect(scan(value)).toBe(value);
    expect(parseResourceId(scan(value)!)).toBe(id);
  });
});

describe("ResourceQrSheet", () => {
  it("shows the app link by default and toggles to the HTTPS URL", () => {
    const { getByLabelText, getByText } = renderSheet();
    expect(mockQrValue).toBe("mindvault://resources/res%2F1%20a");
    fireEvent.press(getByLabelText("Web link"));
    expect(mockQrValue).toBe("https://api.mindvault.test/resources/res%2F1%20a");
    expect(getByText("https://api.mindvault.test/resources/res%2F1%20a")).toBeTruthy();
    fireEvent.press(getByLabelText("App link"));
    expect(mockQrValue).toBe("mindvault://resources/res%2F1%20a");
  });

  it("saves the QR code to Photos when permitted", async () => {
    mockPermission.mockResolvedValue({ granted: true });
    const { getByLabelText, findByText } = renderSheet();
    await act(async () => {
      fireEvent.press(getByLabelText("Save QR code to Photos"));
    });
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/cache\/mindvault-qr-\d+\.png$/),
      "BASE64PNG",
      { encoding: "base64" }
    );
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalled();
    expect(FileSystem.deleteAsync).toHaveBeenCalled();
    expect(await findByText("QR code saved to Photos")).toBeTruthy();
  });

  it("does not save when permission is denied", async () => {
    mockPermission.mockResolvedValue({ granted: false });
    const { getByLabelText, findByText } = renderSheet();
    await act(async () => {
      fireEvent.press(getByLabelText("Save QR code to Photos"));
    });
    expect(MediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled();
    expect(await findByText("Photos permission is needed to save the QR code")).toBeTruthy();
  });

  it("closes", () => {
    const onClose = jest.fn();
    const { getByLabelText } = renderSheet(onClose);
    fireEvent.press(getByLabelText("Close QR code"));
    expect(onClose).toHaveBeenCalled();
  });
});
