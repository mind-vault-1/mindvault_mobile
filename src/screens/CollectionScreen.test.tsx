import { Share } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

import { CollectionScreen } from "./CollectionScreen";
import { ThemeProvider } from "../theme/ThemeProvider";

jest.mock("../api/collections", () => ({ fetchCollection: jest.fn() }));
jest.mock("../api/resources", () => ({ getApiBaseUrl: jest.fn(() => "https://api.test") }));
jest.mock("../components/ResourceCard", () => ({
  ResourceCard: ({ resource }: { resource: { title: string } }) => {
    const { Text } = require("react-native");
    return <Text>{resource.title}</Text>;
  },
}));

const { fetchCollection } = jest.requireMock("../api/collections") as { fetchCollection: jest.Mock };
const navigation = { navigate: jest.fn() } as any;

function renderScreen() {
  return render(
    <ThemeProvider>
      <CollectionScreen navigation={navigation} route={{ params: { collectionId: "c1" } }} />
    </ThemeProvider>
  );
}

describe("CollectionScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders resources in collection order", async () => {
    fetchCollection.mockResolvedValue({
      id: "c1",
      title: "My Collection",
      description: "Desc",
      resources: [
        { id: "r2", title: "Second", price: "1" },
        { id: "r1", title: "First", price: "2" },
      ],
    });
    const screen = renderScreen();
    expect(await screen.findByText("My Collection")).toBeTruthy();
    const texts = screen.getAllByText(/First|Second/).map((n) => n.props.children);
    expect(texts).toEqual(["Second", "First"]);
  });

  it("shows empty state for empty collection", async () => {
    fetchCollection.mockResolvedValue({ id: "c1", title: "Empty", description: "", resources: [] });
    const screen = renderScreen();
    expect(await screen.findByText("No resources in this collection")).toBeTruthy();
  });

  it("shares a collection link", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction } as any);
    fetchCollection.mockResolvedValue({ id: "c1", title: "My Collection", resources: [] });
    const screen = renderScreen();
    await screen.findByText("My Collection");
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Share collection"));
    });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://api.test/collections/c1",
    }));
  });
});
