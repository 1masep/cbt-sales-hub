import { COMMODITY_CATEGORIES, SALES_REPS } from "./config";
import { computeTotal } from "./total";

export type Sale = {
  invoiceNumber: string;
  customerName: string;
  date: string; // YYYY-MM-DD
  commodityCategory: string;
  sku: string;
  quantity: number;
  price: number; // per unit; stored for reference, separate from invoiceAmount
  invoiceAmount: number;
  discount: number;
  salesTax: number;
  totalAmount: number;
  salesRep: string;
  address: string;
  zipCode: string;
  phone: string;
  email: string;
  // Reasons the owner should double-check this sale. A sale is never refused
  // for these; losing a real order is worse than an odd phone number.
  flags: string[];
};

export const FLAGS = {
  noPhone: "No phone number",
  foreignPhone: "Phone isn't a US number",
  noPostalCode: "No postal code",
  foreignPostalCode: "Postal code isn't a US zip code",
} as const;

export type FieldErrors = Record<string, string>;

export type ValidationResult = { ok: true; sale: Sale } | { ok: false; errors: FieldErrors };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
// A calendar date, optionally followed by an ISO time (only the date is kept).
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
// Invisible control characters (null bytes, bells, line breaks…) are never valid in these fields.
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
// Keeps every amount, and amount + tax, inside the database's integer range.
export const MAX_MONEY = 9_999_999.99;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const MONEY_RE = /^\d+(\.\d{1,2})?$/;

function text(input: Record<string, unknown>, key: string, errors: FieldErrors, max = 200): string {
  const value = input[key];
  if (typeof value !== "string" && typeof value !== "number") {
    errors[key] = "Required";
    return "";
  }
  const trimmed = String(value).trim();
  if (!trimmed) errors[key] = "Required";
  else if (CONTROL_RE.test(trimmed)) errors[key] = "Contains invalid characters";
  else if (trimmed.length > max) errors[key] = `Must be ${max} characters or fewer`;
  return trimmed;
}

// Like text(), but an empty value is allowed.
function optionalText(input: Record<string, unknown>, key: string, errors: FieldErrors, max: number): string {
  const value = input[key];
  if (value === undefined || value === null || value === "") return "";
  return text(input, key, errors, max);
}

function money(input: Record<string, unknown>, key: string, errors: FieldErrors, required: boolean): number {
  const value = input[key];
  if (value === undefined || value === null || value === "") {
    if (required) errors[key] = "Required";
    return 0;
  }
  const str = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!MONEY_RE.test(str)) {
    errors[key] = "Must be a non-negative amount with at most 2 decimals";
    return 0;
  }
  if (Number(str) > MAX_MONEY) {
    errors[key] = "Must be $9,999,999.99 or less";
    return 0;
  }
  return Number(str);
}

function quantity(input: Record<string, unknown>, errors: FieldErrors): number {
  const value = input.quantity;
  const str = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (value === undefined || value === null || str === "") {
    errors.quantity = "Required";
    return 0;
  }
  if (!/^\d+$/.test(str) || Number(str) < 1 || Number(str) > 1_000_000) {
    errors.quantity = "Must be a whole number from 1 to 1,000,000";
    return 0;
  }
  return Number(str);
}

function date(input: Record<string, unknown>, errors: FieldErrors): string {
  const value = input.date;
  const match = typeof value === "string" ? DATE_RE.exec(value.trim()) : null;
  if (!match) {
    errors.date = "Must be a date in YYYY-MM-DD format";
    return "";
  }
  const [, y, m, d] = match;
  if (Number(y) < MIN_YEAR || Number(y) > MAX_YEAR) {
    errors.date = `Year must be between ${MIN_YEAR} and ${MAX_YEAR}`;
    return "";
  }
  const parsed = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (parsed.getUTCFullYear() !== Number(y) || parsed.getUTCMonth() !== Number(m) - 1 || parsed.getUTCDate() !== Number(d)) {
    errors.date = "Not a real calendar date";
    return "";
  }
  return `${y}-${m}-${d}`;
}

// US numbers are tidied to "(802) 555-0147" (keeping any extension). Anything
// else is kept exactly as the customer typed it and flagged.
function phone(input: Record<string, unknown>, errors: FieldErrors, flags: string[]): string {
  const raw = optionalText(input, "phone", errors, 40);
  if (errors.phone) return raw;
  if (!raw) {
    flags.push(FLAGS.noPhone);
    return "";
  }
  const [, main, ext] = /^(.*?)(?:\s*(?:ext\.?|x|#)\s*(\d{1,6}))?$/i.exec(raw)!;
  let digits = main.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  const otherCountryCode = /^\+(?!1)/.test(main.trim());
  if (/^[\d\s().+-]+$/.test(main) && digits.length === 10 && !otherCountryCode) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}${ext ? ` ext. ${ext}` : ""}`;
  }
  flags.push(FLAGS.foreignPhone);
  return raw;
}

function postalCode(input: Record<string, unknown>, errors: FieldErrors, flags: string[]): string {
  const value = optionalText(input, "zipCode", errors, 12);
  if (errors.zipCode) return value;
  if (!value) flags.push(FLAGS.noPostalCode);
  else if (!ZIP_RE.test(value)) flags.push(FLAGS.foreignPostalCode);
  return value;
}

function oneOf(input: Record<string, unknown>, key: string, allowed: readonly string[], errors: FieldErrors): string {
  const value = text(input, key, errors);
  if (errors[key]) return value;
  const match = allowed.find((option) => option.toLowerCase() === value.toLowerCase());
  if (!match) {
    errors[key] = `Must be one of: ${allowed.join(", ")}`;
    return value;
  }
  return match;
}

export function validateSale(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: { body: "Request body must be a JSON object" } };
  }
  const input = body as Record<string, unknown>;
  const errors: FieldErrors = {};
  const flags: string[] = [];

  const invoiceNumber = text(input, "invoiceNumber", errors, 64);
  const customerName = text(input, "customerName", errors);
  const saleDate = date(input, errors);
  const commodityCategory = oneOf(input, "commodityCategory", COMMODITY_CATEGORIES, errors);
  const sku = text(input, "sku", errors, 64);
  const qty = quantity(input, errors);
  const price = money(input, "price", errors, true);
  const invoiceAmount = money(input, "invoiceAmount", errors, true);
  const discount = money(input, "discount", errors, false);
  const salesTax = money(input, "salesTax", errors, false);
  const salesRep = oneOf(input, "salesRep", SALES_REPS, errors);
  const address = text(input, "address", errors, 300);
  const zipCode = postalCode(input, errors, flags);
  const phoneNumber = phone(input, errors, flags);
  const email = text(input, "email", errors, 254).toLowerCase();

  if (!errors.email && !EMAIL_RE.test(email)) errors.email = "Must be a valid email address";
  if (!errors.invoiceAmount && !errors.discount && discount > invoiceAmount) {
    errors.discount = "Cannot be larger than the invoice amount";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    sale: {
      invoiceNumber,
      customerName,
      date: saleDate,
      commodityCategory,
      sku,
      quantity: qty,
      price,
      invoiceAmount,
      discount,
      salesTax,
      totalAmount: computeTotal(invoiceAmount, discount, salesTax),
      salesRep,
      address,
      zipCode,
      phone: phoneNumber,
      email,
      flags,
    },
  };
}
