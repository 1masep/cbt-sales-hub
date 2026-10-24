export function validSale(overrides: Record<string, unknown> = {}) {
  return {
    invoiceNumber: "INV-1001",
    customerName: "Acme Supply Co.",
    date: "2026-10-24",
    commodityCategory: "Kitchen",
    sku: "EL-HDMI-2M",
    quantity: 4,
    price: 250,
    invoiceAmount: 1000,
    discount: 50,
    salesTax: 76,
    salesRep: "Website",
    address: "123 Main St, Springfield, MA",
    zipCode: "01105",
    phone: "413-555-0199",
    email: "Buyer@Acme.com",
    ...overrides,
  };
}
