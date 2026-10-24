import { describe, expect, it } from "vitest";
import { COMMODITY_CATEGORIES, SALES_REPS } from "../lib/config";
import { validateSale } from "../lib/validate";
import { validSale } from "./fixtures";

describe("category and sales rep lists", () => {
  it("are non-empty and have no duplicates", () => {
    for (const list of [COMMODITY_CATEGORIES, SALES_REPS]) {
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list.map((v) => v.toLowerCase())).size).toBe(list.length);
    }
  });

  it.each(COMMODITY_CATEGORIES)("accepts category %s", (commodityCategory) => {
    expect(validateSale(validSale({ commodityCategory })).ok).toBe(true);
  });

  it.each(SALES_REPS)("accepts sales rep %s", (salesRep) => {
    expect(validateSale(validSale({ salesRep })).ok).toBe(true);
  });

  it("matches case-insensitively and stores the canonical spelling", () => {
    const result = validateSale(validSale({ commodityCategory: "kitchen", salesRep: "website" }));
    expect(result.ok && [result.sale.commodityCategory, result.sale.salesRep]).toEqual(["Kitchen", "Website"]);
  });

  it("rejects values not in the lists", () => {
    const result = validateSale(validSale({ commodityCategory: "Spaceships", salesRep: "Nobody" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["commodityCategory", "salesRep"]);
  });
});
