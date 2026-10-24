// Money is handled in integer cents to avoid floating-point drift (0.1 + 0.2).
export function toCents(value: number): number {
  return Math.round(value * 100);
}

export function computeTotal(invoiceAmount: number, discount: number, salesTax: number): number {
  return (toCents(invoiceAmount) - toCents(discount) + toCents(salesTax)) / 100;
}
