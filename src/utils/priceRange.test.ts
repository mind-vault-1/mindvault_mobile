import { filterByPriceRange, parsePriceRange } from "./priceRange";

const items = [
  { id: "a", price: "1.00" },
  { id: "b", price: "5.00" },
  { id: "c", price: "10.00" },
];

describe("parsePriceRange", () => {
  it("treats blank and non-numeric fields as unset bounds", () => {
    expect(parsePriceRange("", "")).toEqual({
      min: null,
      max: null,
      isInvalid: false,
      isActive: false,
    });
    expect(parsePriceRange("abc", " ")).toEqual({
      min: null,
      max: null,
      isInvalid: false,
      isActive: false,
    });
  });

  it("is active when a single bound is set", () => {
    expect(parsePriceRange("2", "")).toMatchObject({ min: 2, max: null, isActive: true });
    expect(parsePriceRange("", "2")).toMatchObject({ min: null, max: 2, isActive: true });
  });

  it("accepts a range where the minimum equals the maximum", () => {
    expect(parsePriceRange("5", "5")).toMatchObject({ isInvalid: false, isActive: true });
  });

  it("flags an inverted range as invalid and inactive", () => {
    expect(parsePriceRange("10", "5")).toMatchObject({
      min: 10,
      max: 5,
      isInvalid: true,
      isActive: false,
    });
  });

  it("does not flag a partial range as invalid", () => {
    expect(parsePriceRange("10", "")).toMatchObject({ isInvalid: false });
    expect(parsePriceRange("", "5")).toMatchObject({ isInvalid: false });
  });
});

describe("filterByPriceRange", () => {
  it("returns every item when no bound is set", () => {
    expect(filterByPriceRange(items, parsePriceRange("", ""))).toEqual(items);
  });

  it("applies the bounds inclusively", () => {
    expect(filterByPriceRange(items, parsePriceRange("1", "5")).map((i) => i.id)).toEqual([
      "a",
      "b",
    ]);
    expect(filterByPriceRange(items, parsePriceRange("5", "")).map((i) => i.id)).toEqual([
      "b",
      "c",
    ]);
    expect(filterByPriceRange(items, parsePriceRange("", "5")).map((i) => i.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("leaves the list untouched when the range is inverted", () => {
    expect(filterByPriceRange(items, parsePriceRange("10", "5"))).toEqual(items);
  });

  it("drops items without a numeric price while the range is applied", () => {
    const withUnpriced = [...items, { id: "d", price: "free" }];
    expect(filterByPriceRange(withUnpriced, parsePriceRange("1", "10")).map((i) => i.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(filterByPriceRange(withUnpriced, parsePriceRange("", ""))).toEqual(withUnpriced);
  });
});
