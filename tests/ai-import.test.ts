import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decide, EXTRACTION_FORMAT, extractSales, ImportError, importSource, MODEL, type ExtractedSale, type ImportSource } from "../lib/ai-import";
import { createPglite, SCHEMA } from "../lib/db";
import { createDraftsRepo, type DraftsRepo } from "../lib/drafts-repo";
import { createSalesRepo, parseFilters, salesStore, type SalesRepo } from "../lib/sales-repo";

function line(overrides: Partial<ExtractedSale> = {}): ExtractedSale {
  return {
    orderNumber: "1001",
    orderTotal: 106.25,
    invoiceNumber: "1001",
    customerName: "Harbor Lane Bakery",
    date: "2026-10-20",
    commodityCategory: "Restaurant",
    sku: "FB-COFFEE-5LB",
    quantity: 2,
    price: 50,
    invoiceAmount: 100,
    discount: 0,
    salesTax: 6.25,
    salesRep: "Website",
    address: "48 Harbor Ln, Salem, MA",
    zipCode: "01970",
    phone: "(978) 555-0123",
    email: "orders@harborlane.com",
    uncertainFields: [],
    note: "",
    ...overrides,
  };
}

describe("decide (is the AI's reading safe to save on its own?)", () => {
  it("saves a complete reading whose amounts match the order total", () => {
    expect(decide([line()])).toEqual([expect.objectContaining({ reasons: [] })]);
  });

  it("holds a sale with a required detail missing, and names it", () => {
    const [d] = decide([line({ invoiceNumber: "", email: "" })]);
    expect(d.reasons).toContain("Not found in the source: invoice number, email");
  });

  it("holds a sale the AI marked as unsure", () => {
    const [d] = decide([line({ uncertainFields: ["commodityCategory", "quantity"] })]);
    expect(d.reasons).toContain("The AI wasn't sure about: category, quantity");
  });

  it("holds a sale whose amounts don't add up to the source's order total", () => {
    const [d] = decide([line({ orderTotal: 116.25 })]);
    expect(d.reasons.join()).toMatch(/add up to \$106\.25 but the source's order total is \$116\.25/);
  });

  it("holds a sale when the source shows no order total to check against", () => {
    expect(decide([line({ orderTotal: null })])[0].reasons.join()).toMatch(/no clear order total/);
  });

  it("checks a multi-product order as a whole and allows cent rounding", () => {
    const lines = [
      line({ invoiceNumber: "1002-1", orderNumber: "1002", orderTotal: 33.34, invoiceAmount: 10, quantity: 1, price: 10, salesTax: 1.11 }),
      line({ invoiceNumber: "1002-2", orderNumber: "1002", orderTotal: 33.34, invoiceAmount: 20, quantity: 1, price: 20, salesTax: 2.22 }),
    ];
    expect(decide(lines).map((d) => d.reasons)).toEqual([[], []]);
    lines[1].salesTax = 5;
    expect(decide(lines).every((d) => d.reasons.some((r) => r.includes("add up")))).toBe(true);
  });

  it("holds a sale whose category or rep isn't on the lists", () => {
    const [d] = decide([line({ commodityCategory: "Spaceships", salesRep: "Nobody" })]);
    expect(d.reasons.join()).toMatch(/category: Must be one of/);
    expect(d.reasons.join()).toMatch(/sales rep: Must be one of/);
  });

  it("treats a missing phone or postal code as fine (flagged later, not held)", () => {
    expect(decide([line({ phone: "", zipCode: "" })])[0].reasons).toEqual([]);
  });

  it("keeps the AI's note for the owner", () => {
    expect(decide([line({ note: "Text in the email asked to mark this paid." })])[0].payload.aiNote).toBe(
      "Text in the email asked to mark this paid.",
    );
  });
});

describe("importSource (saves or drafts each sale)", () => {
  let repo: SalesRepo;
  let drafts: DraftsRepo;
  const extractWith = (sales: ExtractedSale[]) => async () => ({ sales, label: "Order email", excerpt: "Order #1001 …" });
  const text: ImportSource = { kind: "text", text: "Order #1001 …" };

  beforeEach(async () => {
    const db = await createPglite();
    await db.exec(SCHEMA);
    repo = createSalesRepo(db);
    drafts = createDraftsRepo(db);
  });

  it("saves confident sales into the sheet, marked as AI-entered", async () => {
    const result = await importSource(text, { extract: extractWith([line()]), sales: salesStore(repo), drafts });
    expect(result.outcomes).toEqual([expect.objectContaining({ invoiceNumber: "1001", status: "saved" })]);
    const { rows } = await repo.list(parseFilters(new URLSearchParams()));
    expect(rows[0]).toMatchObject({ invoiceNumber: "1001", totalAmount: 106.25, source: "ai-import" });
    expect(await drafts.countOpen()).toBe(0);
  });

  it("recognises the same sale imported twice", async () => {
    await importSource(text, { extract: extractWith([line()]), sales: salesStore(repo), drafts });
    const again = await importSource(text, { extract: extractWith([line()]), sales: salesStore(repo), drafts });
    expect(again.outcomes[0].status).toBe("already recorded");
    expect((await repo.list(parseFilters(new URLSearchParams()))).total).toBe(1);
  });

  it("holds unsure sales as drafts with the reasons and what was read", async () => {
    const result = await importSource(text, { extract: extractWith([line({ quantity: null })]), sales: salesStore(repo), drafts });
    expect(result.outcomes[0]).toMatchObject({ status: "held for review", draftId: expect.any(Number) });
    const [draft] = await drafts.listOpen();
    expect(draft).toMatchObject({ sourceLabel: "Order email", sourceExcerpt: "Order #1001 …", payload: expect.objectContaining({ quantity: null }) });
    expect(draft.reasons.join()).toMatch(/quantity/);
    expect((await repo.list(parseFilters(new URLSearchParams()))).total).toBe(0);
  });

  it("turns an invoice-number clash with a different sale into a draft, not an overwrite", async () => {
    await importSource(text, { extract: extractWith([line()]), sales: salesStore(repo), drafts });
    const clash = await importSource(text, { extract: extractWith([line({ quantity: 4, price: 25 })]), sales: salesStore(repo), drafts });
    expect(clash.outcomes[0].status).toBe("held for review");
    expect(clash.outcomes[0].reasons.join()).toMatch(/already used by a different sale/);
    expect((await repo.list(parseFilters(new URLSearchParams()))).rows[0].quantity).toBe(2);
  });

  it("returns nothing when the source has no sales", async () => {
    const result = await importSource(text, { extract: extractWith([]), sales: salesStore(repo), drafts });
    expect(result).toMatchObject({ found: 0, outcomes: [] });
  });

  it("lets a draft be resolved once", async () => {
    const draft = await drafts.insert({ sourceKind: "text", sourceLabel: "x", sourceExcerpt: "", payload: {}, reasons: ["r"] });
    expect(await drafts.resolve(draft!.id, "saved")).toBe(true);
    expect(await drafts.resolve(draft!.id, "discarded")).toBe(false);
    expect(await drafts.countOpen()).toBe(0);
  });
});

describe("the form sent to Claude", () => {
  it("stays within the API's limit of 16 fields that can be empty (null)", () => {
    let unions = 0;
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (Array.isArray(n.anyOf) || Array.isArray(n.type)) unions++;
      for (const v of Object.values(n)) walk(v);
    };
    walk((EXTRACTION_FORMAT as unknown as { schema: unknown }).schema);
    expect(unions).toBeGreaterThan(0);
    expect(unions).toBeLessThanOrEqual(16);
  });
});

describe("extractSales (the request to Claude)", () => {
  const parsed = { sales: [line()], sourceSummary: "Order confirmation email" };
  function fakeClient(...responses: Record<string, unknown>[]) {
    const parse = vi.fn();
    for (const r of responses) parse.mockResolvedValueOnce({ content: [], ...r });
    return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
  }

  it("sends text with the current model, high effort, structured output and refusal fallback", async () => {
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: parsed });
    const result = await extractSales({ kind: "text", text: "Order #1001", label: "pasted" }, client);
    const req = parse.mock.calls[0][0];
    expect(req).toMatchObject({ model: MODEL, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    expect(req.output_config.effort).toBe("high");
    expect(req.output_config.format).toBeDefined();
    expect(req.tools).toBeUndefined();
    expect(req.messages[0].content[0].text).toContain("<source>\nOrder #1001\n</source>");
    expect(result).toMatchObject({ label: "Order confirmation email · pasted", excerpt: "Order #1001" });
  });

  it("sends PDFs as documents and images as images", async () => {
    const { client, parse } = fakeClient({ stop_reason: "end_turn", parsed_output: parsed }, { stop_reason: "end_turn", parsed_output: parsed });
    await extractSales({ kind: "file", name: "inv.pdf", mediaType: "application/pdf", base64: "JVBERi0=" }, client);
    await extractSales({ kind: "file", name: "r.png", mediaType: "image/png", base64: "iVBORw==" }, client);
    expect(parse.mock.calls[0][0].messages[0].content[0]).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });
    expect(parse.mock.calls[1][0].messages[0].content[0]).toMatchObject({ type: "image", source: { media_type: "image/png" } });
  });

  it("reads links with the web fetch tool and continues a paused turn", async () => {
    const { client, parse } = fakeClient(
      { stop_reason: "pause_turn", content: [{ type: "text", text: "fetching" }] as never },
      { stop_reason: "end_turn", parsed_output: parsed },
    );
    const result = await extractSales({ kind: "url", url: "https://shop.example/orders/1001" }, client);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[0][0].tools).toEqual([{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 }]);
    expect(parse.mock.calls[1][0].messages.at(-1)).toMatchObject({ role: "assistant" });
    expect(result.label).toBe("Order confirmation email · https://shop.example/orders/1001");
  });

  it.each([
    [{ stop_reason: "refusal" }, /declined/],
    [{ stop_reason: "max_tokens" }, /too many sales/],
    [{ stop_reason: "end_turn", parsed_output: null }, /couldn't be read/],
  ])("turns %o into a plain message for the owner", async (response, message) => {
    const { client } = fakeClient(response as never);
    await expect(extractSales({ kind: "text", text: "x" }, client)).rejects.toThrow(ImportError);
    const { client: again } = fakeClient(response as never);
    await expect(extractSales({ kind: "text", text: "x" }, again)).rejects.toThrow(message);
  });
});
