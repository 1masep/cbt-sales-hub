import { describe, expect, it } from "vitest";
import { FLAGS, validateSale } from "../lib/validate";
import { validSale } from "./fixtures";

function errorsFor(overrides: Record<string, unknown>) {
  const result = validateSale(validSale(overrides));
  if (result.ok) throw new Error("expected validation to fail");
  return result.errors;
}

describe("validateSale", () => {
  it("accepts a valid sale, normalises fields and computes the total", () => {
    const result = validateSale(validSale({ totalAmount: 999999 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sale.totalAmount).toBe(1026); // client-sent total is ignored
    expect(result.sale.phone).toBe("(413) 555-0199");
    expect(result.sale.email).toBe("buyer@acme.com");
    expect(result.sale.zipCode).toBe("01105");
    expect(result.sale.flags).toEqual([]);
  });

  it("defaults missing discount and sales tax to 0", () => {
    const result = validateSale(validSale({ discount: undefined, salesTax: undefined }));
    expect(result.ok && result.sale.totalAmount).toBe(1000);
  });

  it("rejects non-object bodies", () => {
    expect(validateSale(null).ok).toBe(false);
    expect(validateSale([]).ok).toBe(false);
    expect(validateSale("sale").ok).toBe(false);
  });

  it("reports every missing required field", () => {
    const result = validateSale({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    for (const key of ["invoiceNumber", "customerName", "date", "commodityCategory", "sku", "quantity", "price", "invoiceAmount", "salesRep", "address", "email"]) {
      expect(result.errors).toHaveProperty(key);
    }
  });

  it.each(["not-an-email", "a@b", "a b@c.com"])("rejects email %s", (email) => {
    expect(errorsFor({ email })).toHaveProperty("email");
  });

  function flagsFor(overrides: Record<string, unknown>) {
    const result = validateSale(validSale(overrides));
    if (!result.ok) throw new Error(`expected the sale to be accepted: ${JSON.stringify(result.errors)}`);
    return result.sale;
  }

  it.each([
    ["+1 (413) 555-0199", "(413) 555-0199"],
    ["4135550199", "(413) 555-0199"],
    ["1-413-555-0199", "(413) 555-0199"],
    ["(802) 555-0147 ext. 12", "(802) 555-0147 ext. 12"],
    ["802-555-0147 x7", "(802) 555-0147 ext. 7"],
  ])("tidies US phone %s with no flag", (phone, tidy) => {
    const sale = flagsFor({ phone });
    expect([sale.phone, sale.flags]).toEqual([tidy, []]);
  });

  it.each(["+44 20 7946 0958", "555-0199", "22345678901", "413-555-01x9", "call after 5pm"])(
    "keeps other phone %s exactly as typed and flags it",
    (phone) => {
      const sale = flagsFor({ phone });
      expect([sale.phone, sale.flags]).toEqual([phone, [FLAGS.foreignPhone]]);
    },
  );

  it.each([undefined, null, ""])("accepts a missing phone (%s) and flags it", (phone) => {
    const sale = flagsFor({ phone });
    expect([sale.phone, sale.flags]).toEqual(["", [FLAGS.noPhone]]);
  });

  it.each(["K1A 0B1", "SW1A 1AA", "1234", "12345-678", "ABCDE"])("keeps postal code %s and flags it", (zipCode) => {
    const sale = flagsFor({ zipCode });
    expect([sale.zipCode, sale.flags]).toEqual([zipCode, [FLAGS.foreignPostalCode]]);
  });

  it("accepts a missing postal code and flags it", () => {
    expect(flagsFor({ zipCode: "" }).flags).toEqual([FLAGS.noPostalCode]);
  });

  it("can carry several flags at once", () => {
    expect(flagsFor({ zipCode: "K1A 0B1", phone: "" }).flags).toEqual([FLAGS.foreignPostalCode, FLAGS.noPhone]);
  });

  it("still refuses control characters and over-long phone or postal code", () => {
    expect(errorsFor({ phone: "802\u0000555" })).toHaveProperty("phone");
    expect(errorsFor({ phone: "1".repeat(41) })).toHaveProperty("phone");
    expect(errorsFor({ zipCode: "1".repeat(13) })).toHaveProperty("zipCode");
  });

  it("accepts ZIP+4", () => {
    expect(validateSale(validSale({ zipCode: "01105-1234" })).ok).toBe(true);
  });

  it.each(["10/24/2026", "2026-02-30", "2026-13-01", "yesterday"])("rejects date %s", (date) => {
    expect(errorsFor({ date })).toHaveProperty("date");
  });

  it("accepts an ISO timestamp and keeps only the date", () => {
    const result = validateSale(validSale({ date: "2026-10-24T15:30:00Z" }));
    expect(result.ok && result.sale.date).toBe("2026-10-24");
  });

  it.each([-5, "12.345", "abc", "1,000"])("rejects money value %s", (invoiceAmount) => {
    expect(errorsFor({ invoiceAmount })).toHaveProperty("invoiceAmount");
  });

  it("accepts money as a numeric string", () => {
    const result = validateSale(validSale({ invoiceAmount: "1000.00", discount: "0", salesTax: "76.5" }));
    expect(result.ok && result.sale.totalAmount).toBe(1076.5);
  });

  it.each([0, -1, 2.5, "3.0", "abc", 1_000_001])("rejects quantity %s", (quantity) => {
    expect(errorsFor({ quantity })).toHaveProperty("quantity");
  });

  it("accepts quantity and price as strings and keeps them separate from the invoice amount", () => {
    const result = validateSale(validSale({ sku: "  AP-TEE-L ", quantity: "12", price: "19.99", invoiceAmount: 500 }));
    expect(result.ok && [result.sale.sku, result.sale.quantity, result.sale.price, result.sale.invoiceAmount]).toEqual([
      "AP-TEE-L",
      12,
      19.99,
      500,
    ]);
  });

  it.each(["-1", "1.234", "free"])("rejects price %s", (price) => {
    expect(errorsFor({ price })).toHaveProperty("price");
  });

  it.each([
    ["customerName", "abc\u0000def"],
    ["sku", "A\u0007B"],
    ["address", "line 1\nline 2"],
  ])("rejects control characters in %s", (field, value) => {
    expect(errorsFor({ [field]: value })).toHaveProperty(field);
  });

  it.each(["invoiceAmount", "price", "salesTax", "discount"])("rejects %s over $9,999,999.99", (field) => {
    expect(errorsFor({ [field]: 10_000_000 })).toHaveProperty(field);
  });

  it("accepts the maximum amount", () => {
    expect(validateSale(validSale({ invoiceAmount: "9999999.99", salesTax: "9999999.99" })).ok).toBe(true);
  });

  it.each(["1999-12-31", "2101-01-01", "9999-12-31", "2026-10-24garbage", "2026-10-24T"])("rejects date %s", (date) => {
    expect(errorsFor({ date })).toHaveProperty("date");
  });

  it.each(["2026-10-24T15:30:00Z", "2026-10-24T15:30:00.123+05:30", "2026-10-24 15:30"])("accepts timestamp %s", (date) => {
    const result = validateSale(validSale({ date }));
    expect(result.ok && result.sale.date).toBe("2026-10-24");
  });

  it("rejects a discount larger than the invoice amount", () => {
    expect(errorsFor({ discount: 1500 })).toHaveProperty("discount");
  });
});
