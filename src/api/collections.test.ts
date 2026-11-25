import { createCollection, fetchCollection, fetchCollections } from "./collections";

jest.mock("./client", () => ({ request: jest.fn() }));
jest.mock("./resources", () => ({
  getApiBaseUrl: jest.fn(() => "https://api.test"),
  publisherFetch: jest.fn(),
}));

const { request } = jest.requireMock("./client") as { request: jest.Mock };
const { publisherFetch } = jest.requireMock("./resources") as { publisherFetch: jest.Mock };

describe("collections API", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a collection with ordered resource IDs", async () => {
    publisherFetch.mockResolvedValue({ id: "c1", title: "T", description: "D", resourceIds: ["r2", "r1"] });
    const result = await createCollection({ title: " T ", description: " D ", resourceIds: ["r2", "r1", " "] });
    expect(publisherFetch).toHaveBeenCalledWith(
      "/collections",
      {
        method: "POST",
        body: { title: "T", description: "D", resourceIds: ["r2", "r1"] },
      },
      "Failed to create collection"
    );
    expect(result.resourceIds).toEqual(["r2", "r1"]);
  });

  it("fetches a collection by id", async () => {
    request.mockResolvedValue({ data: { id: "c1", title: "T", resources: [] } });
    const result = await fetchCollection("c1");
    expect(request).toHaveBeenCalledWith("https://api.test/collections/c1", expect.any(Object));
    expect(result.id).toBe("c1");
  });

  it("fetches collections list", async () => {
    request.mockResolvedValue({ data: [{ id: "c1", title: "T" }] });
    const result = await fetchCollections();
    expect(result).toHaveLength(1);
  });
});
