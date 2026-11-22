import { render, screen } from "@testing-library/react-native";

import { OfflineBanner } from "./OfflineBanner";
import { ThemeProvider } from "../theme/ThemeProvider";

describe("OfflineBanner", () => {
  function renderBanner(isOffline: boolean) {
    return render(
      <ThemeProvider>
        <OfflineBanner isOffline={isOffline} />
      </ThemeProvider>
    );
  }

  it("renders when offline", () => {
    renderBanner(true);
    expect(screen.getByText("No Internet Connection")).toBeTruthy();
  });

  it("does not render when online", () => {
    renderBanner(false);
    expect(screen.queryByText("No Internet Connection")).toBeNull();
  });

  it("has accessibility live region and role", () => {
    renderBanner(true);
    const banner = screen.getByLabelText("No internet connection");
    expect(banner.props.accessibilityRole).toBe("alert");
    expect(banner.props.accessibilityLiveRegion).toBe("polite");
  });
});
