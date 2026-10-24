// Edit these lists to match your business BEFORE running `npm run setup-excel`.
// They drive API validation and are copied into the workbook's dropdowns and
// Summary rows. If you change them later, update the workbook's Lists and
// Summary tabs to match.
// The top-level product categories on cbthospitalitysupplies.com (WooCommerce).
export const COMMODITY_CATEGORIES = ["Restaurant", "Kitchen", "Bedding", "Bath", "Cups & Lids", "Vacuums & More", "Misc."] as const;

// WooCommerce categories that are store groupings, not types of goods. A product
// is categorised by its other categories; these are ignored.
export const STORE_GROUPINGS = ["New Products", "SALE Items", "Special Order", "Catalog"] as const;

// "Website" = online orders. "In-store" = point-of-sale orders whose cashier
// isn't listed here. Add the business's named reps to this list.
export const SALES_REPS = ["Website", "In-store"] as const;

export const SALES_TAB = "Sales";
export const SUMMARY_TAB = "Summary";
export const LISTS_TAB = "Lists";

// Column order of the sheet and the Excel download.
export const COLUMNS = [
  "Invoice Number", // A
  "Customer/Company Name", // B
  "Date", // C
  "Commodity Category", // D
  "SKU", // E
  "Quantity", // F
  "Price", // G
  "Invoice Amount", // H
  "Discount", // I
  "Sales Tax", // J
  "Total Amount", // K
  "Sales Rep", // L
  "Address", // M
  "Zip Code", // N
  "Phone", // O
  "Email", // P
] as const;
