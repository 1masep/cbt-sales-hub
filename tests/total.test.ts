import { describe, expect, it } from "vitest";
import { computeTotal } from "../lib/total";

describe("computeTotal", () => {
  it("is invoice amount minus discount plus sales tax", () => {
    expect(computeTotal(1000, 50, 76)).toBe(1026);
  });

  it("avoids floating-point drift", () => {
    expect(computeTotal(0.1, 0, 0.2)).toBe(0.3);
    expect(computeTotal(19.99, 1.33, 1.6)).toBe(20.26);
  });

  it("handles zero discount and tax", () => {
    expect(computeTotal(250.5, 0, 0)).toBe(250.5);
  });
});
