/**
 * Parsing and filtering helpers for the catalog's min/max price range.
 *
 * The range is entered as two free-text fields, so either side can be blank
 * or not a number, and the minimum can end up above the maximum. An inverted
 * range has no possible match, so instead of silently emptying the catalog it
 * is reported as invalid: callers surface the message and leave the price
 * filter switched off until the range is corrected.
 */

export interface PriceRange {
  /** Parsed minimum, or `null` when the field is blank or not a number. */
  min: number | null;
  /** Parsed maximum, or `null` when the field is blank or not a number. */
  max: number | null;
  /** True when both bounds are set and the minimum is above the maximum. */
  isInvalid: boolean;
  /** True when the range can be applied, i.e. it has a bound and is valid. */
  isActive: boolean;
}

/** Message shown next to the price inputs while the range is inverted. */
export const INVALID_PRICE_RANGE_MESSAGE =
  "Minimum price is higher than maximum price. The price filter is off until you fix the range.";

function parseBound(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parsePriceRange(minPrice: string, maxPrice: string): PriceRange {
  const min = parseBound(minPrice);
  const max = parseBound(maxPrice);
  const isInvalid = min !== null && max !== null && min > max;

  return {
    min,
    max,
    isInvalid,
    isActive: !isInvalid && (min !== null || max !== null),
  };
}

/**
 * Filters items by the given range. An inactive range (no bounds, or an
 * inverted one) leaves the list untouched, so the other filters keep working
 * on their own. Items without a numeric price are dropped whenever the range
 * is applied, since they cannot be compared against a bound.
 */
export function filterByPriceRange<T extends { price: string }>(
  items: T[],
  range: PriceRange
): T[] {
  if (!range.isActive) return items;

  return items.filter((item) => {
    const price = Number.parseFloat(item.price);
    if (Number.isNaN(price)) return false;
    if (range.min !== null && price < range.min) return false;
    if (range.max !== null && price > range.max) return false;
    return true;
  });
}
