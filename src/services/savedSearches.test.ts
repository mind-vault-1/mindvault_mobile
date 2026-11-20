import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  getSavedSearches,
  saveSearch,
  updateSearch,
  deleteSearch,
  clearAllSavedSearches,
  type SavedSearch,
} from "./savedSearches";

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("savedSearches", () => {
  describe("getSavedSearches", () => {
    it("should return an empty array when no searches are saved", async () => {
      const searches = await getSavedSearches();
      expect(searches).toEqual([]);
    });

    it("should return saved searches from storage", async () => {
      const search: Omit<SavedSearch, "id" | "createdAt"> = {
        name: "My Search",
        search: "test",
        verification: "all",
        resourceType: "all",
        minPrice: "0",
        maxPrice: "100",
        sort: "newest",
      };

      const saved = await saveSearch(search);
      const loaded = await getSavedSearches();

      expect(loaded).toHaveLength(1);
      expect(loaded[0]).toEqual(saved);
    });

    it("should handle corrupted storage gracefully", async () => {
      await AsyncStorage.setItem("mindvault_saved_searches", "invalid json");
      const searches = await getSavedSearches();
      expect(searches).toEqual([]);
    });

    it("should filter out invalid searches", async () => {
      const data = {
        searches: [
          {
            id: "valid",
            name: "Valid Search",
            search: "query",
            verification: "all",
            resourceType: "all",
            minPrice: "0",
            maxPrice: "100",
            sort: "newest",
            createdAt: "2026-11-20T12:00:00Z",
          },
          {
            id: "invalid",
            name: "Invalid Search",
          },
        ],
      };

      await AsyncStorage.setItem("mindvault_saved_searches", JSON.stringify(data));
      const searches = await getSavedSearches();

      expect(searches).toHaveLength(1);
      expect(searches[0].id).toBe("valid");
    });
  });

  describe("saveSearch", () => {
    it("should save a new search with generated ID and timestamp", async () => {
      const search: Omit<SavedSearch, "id" | "createdAt"> = {
        name: "Electronics",
        search: "phone",
        verification: "verified",
        resourceType: "all",
        minPrice: "50",
        maxPrice: "1000",
        sort: "price_asc",
      };

      const saved = await saveSearch(search);

      expect(saved.id).toBeTruthy();
      expect(saved.id).toMatch(/^search_/);
      expect(saved.name).toBe("Electronics");
      expect(saved.createdAt).toBeTruthy();
      expect(Number.isInteger(Date.parse(saved.createdAt))).toBe(true);
    });

    it("should throw if search name is empty", async () => {
      const search: Omit<SavedSearch, "id" | "createdAt"> = {
        name: "   ",
        search: "query",
        verification: "all",
        resourceType: "all",
        minPrice: "0",
        maxPrice: "100",
        sort: "newest",
      };

      await expect(saveSearch(search)).rejects.toThrow("Search name is required");
    });

    it("should throw if a search with the same name already exists", async () => {
      const search: Omit<SavedSearch, "id" | "createdAt"> = {
        name: "My Search",
        search: "test",
        verification: "all",
        resourceType: "all",
        minPrice: "0",
        maxPrice: "100",
        sort: "newest",
      };

      await saveSearch(search);
      await expect(saveSearch(search)).rejects.toThrow("already exists");
    });

    it("should allow multiple searches with different names", async () => {
      const search1: Omit<SavedSearch, "id" | "createdAt"> = {
        name: "Search 1",
        search: "query1",
        verification: "all",
        resourceType: "all",
        minPrice: "0",
        maxPrice: "100",
        sort: "newest",
      };

      const search2: Omit<SavedSearch, "id" | "createdAt"> = {
        name: "Search 2",
        search: "query2",
        verification: "verified",
        resourceType: "file",
        minPrice: "50",
        maxPrice: "500",
        sort: "price_asc",
      };

      await saveSearch(search1);
      await saveSearch(search2);

      const searches = await getSavedSearches();
      expect(searches).toHaveLength(2);
    });
  });

  describe("updateSearch", () => {
    it("should throw if search is not found", async () => {
      await expect(updateSearch("nonexistent", { name: "New Name" })).rejects.toThrow(
        "Search not found"
      );
    });

    it("should throw if name is emptied", async () => {
      const search: Omit<SavedSearch, "id" | "createdAt"> = {
        name: "Original",
        search: "query",
        verification: "all",
        resourceType: "all",
        minPrice: "0",
        maxPrice: "100",
        sort: "newest",
      };

      const saved = await saveSearch(search);
      await expect(updateSearch(saved.id, { name: "   " })).rejects.toThrow("cannot be empty");
    });

    it("should update a search", async () => {
      const search: Omit<SavedSearch, "id" | "createdAt"> = {
        name: "Original",
        search: "query",
        verification: "all",
        resourceType: "all",
        minPrice: "0",
        maxPrice: "100",
        sort: "newest",
      };

      const saved = await saveSearch(search);
      const updated = await updateSearch(saved.id, {
        name: "Updated",
        verification: "verified",
        sort: "price_asc",
      });

      expect(updated.name).toBe("Updated");
      expect(updated.verification).toBe("verified");
      expect(updated.sort).toBe("price_asc");
      expect(updated.search).toBe("query");
      expect(updated.createdAt).toBe(saved.createdAt);
    });

    it("should preserve createdAt during updates", async () => {
      const search: Omit<SavedSearch, "id" | "createdAt"> = {
        name: "Original",
        search: "query",
        verification: "all",
        resourceType: "all",
        minPrice: "0",
        maxPrice: "100",
        sort: "newest",
      };

      const saved = await saveSearch(search);
      const originalTime = saved.createdAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await updateSearch(saved.id, { name: "Updated" });

      expect(updated.createdAt).toBe(originalTime);
    });
  });

  describe("deleteSearch", () => {
    it("should return false if search is not found", async () => {
      const result = await deleteSearch("nonexistent");
      expect(result).toBe(false);
    });

    it("should delete a search and return true", async () => {
      const search: Omit<SavedSearch, "id" | "createdAt"> = {
        name: "To Delete",
        search: "query",
        verification: "all",
        resourceType: "all",
        minPrice: "0",
        maxPrice: "100",
        sort: "newest",
      };

      const saved = await saveSearch(search);
      const result = await deleteSearch(saved.id);

      expect(result).toBe(true);

      const searches = await getSavedSearches();
      expect(searches).toHaveLength(0);
    });

    it("should remove storage key when last search is deleted", async () => {
      const search: Omit<SavedSearch, "id" | "createdAt"> = {
        name: "Only Search",
        search: "query",
        verification: "all",
        resourceType: "all",
        minPrice: "0",
        maxPrice: "100",
        sort: "newest",
      };

      const saved = await saveSearch(search);
      await deleteSearch(saved.id);

      const item = await AsyncStorage.getItem("mindvault_saved_searches");
      expect(item).toBeNull();
    });

    it("should delete specific search among multiple", async () => {
      const search1: Omit<SavedSearch, "id" | "createdAt"> = {
        name: "Search 1",
        search: "query1",
        verification: "all",
        resourceType: "all",
        minPrice: "0",
        maxPrice: "100",
        sort: "newest",
      };

      const search2: Omit<SavedSearch, "id" | "createdAt"> = {
        name: "Search 2",
        search: "query2",
        verification: "all",
        resourceType: "all",
        minPrice: "0",
        maxPrice: "100",
        sort: "newest",
      };

      const saved1 = await saveSearch(search1);
      const saved2 = await saveSearch(search2);

      await deleteSearch(saved1.id);

      const searches = await getSavedSearches();
      expect(searches).toHaveLength(1);
      expect(searches[0].id).toBe(saved2.id);
    });
  });

  describe("clearAllSavedSearches", () => {
    it("should delete all saved searches", async () => {
      const search1: Omit<SavedSearch, "id" | "createdAt"> = {
        name: "Search 1",
        search: "query1",
        verification: "all",
        resourceType: "all",
        minPrice: "0",
        maxPrice: "100",
        sort: "newest",
      };

      const search2: Omit<SavedSearch, "id" | "createdAt"> = {
        name: "Search 2",
        search: "query2",
        verification: "all",
        resourceType: "all",
        minPrice: "0",
        maxPrice: "100",
        sort: "newest",
      };

      await saveSearch(search1);
      await saveSearch(search2);

      let searches = await getSavedSearches();
      expect(searches).toHaveLength(2);

      await clearAllSavedSearches();

      searches = await getSavedSearches();
      expect(searches).toHaveLength(0);
    });
  });
});
