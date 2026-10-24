import { validateSale, type Sale } from "./validate";

// The storage the API writes to: the sales database (lib/sales-repo.ts).
export interface SalesStore {
  findInvoice(invoiceNumber: string): Promise<Sale | null>;
  // source says where the sale came from, e.g. "website" or "ai-import".
  appendSale(sale: Sale, source?: string): Promise<void>;
}

export class DuplicateInvoiceError extends Error {
  constructor(public invoiceNumber: string) {
    super(`Invoice ${invoiceNumber} already exists`);
  }
}

export type ProcessResult = { status: number; body: Record<string, unknown> };

const SALE_FIELDS: (keyof Sale)[] = [
  "customerName", "date", "commodityCategory", "sku", "quantity", "price", "invoiceAmount",
  "discount", "salesTax", "totalAmount", "salesRep", "address", "zipCode", "phone", "email",
];

function sameSale(a: Sale, b: Sale): boolean {
  return a.invoiceNumber.toLowerCase() === b.invoiceNumber.toLowerCase() && SALE_FIELDS.every((k) => a[k] === b[k]);
}

// Stores re-send orders when they don't hear back. An identical re-send is
// answered as success, so it's never recorded twice. A *different* sale that
// reuses an invoice number is a conflict, so it can't be mistaken for success.
function existingResult(sale: Sale, existing: Sale): ProcessResult {
  if (sameSale(sale, existing)) {
    return { status: 200, body: { ok: true, alreadyRecorded: true, sale: existing } };
  }
  return {
    status: 409,
    body: {
      error: `Invoice ${sale.invoiceNumber} is already used by a different sale`,
      invoiceNumber: sale.invoiceNumber,
      conflict: true,
    },
  };
}

export async function processSale(body: unknown, store: SalesStore, source = "website"): Promise<ProcessResult> {
  const result = validateSale(body);
  if (!result.ok) {
    return { status: 400, body: { error: "Validation failed", fields: result.errors } };
  }

  const { sale } = result;
  const existing = await store.findInvoice(sale.invoiceNumber);
  if (existing) return existingResult(sale, existing);

  try {
    await store.appendSale(sale, source);
  } catch (err) {
    // The database's unique index catches a duplicate that arrived meanwhile.
    if (err instanceof DuplicateInvoiceError) {
      const winner = await store.findInvoice(sale.invoiceNumber);
      if (winner) return existingResult(sale, winner);
    }
    throw err;
  }
  return { status: 201, body: { ok: true, sale } };
}
