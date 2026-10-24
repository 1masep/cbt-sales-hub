import { readWorkbook } from "../../../../../lib/hub/excel";
import { hubStore, loadHub } from "../../../../../lib/hub/load";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_BYTES + 1024 * 1024) return Response.json({ error: "Workbooks must be 10 MB or smaller." }, { status: 413 });
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return Response.json({ error: "Couldn't read the upload." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose an Excel workbook (.xlsx) to upload." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Workbooks must be 10 MB or smaller." }, { status: 413 });
  if (!/\.xlsx$/i.test(file.name)) return Response.json({ error: "Upload an Excel workbook saved as .xlsx (in Excel: File → Save As → Excel Workbook)." }, { status: 400 });

  let parsed;
  try {
    parsed = await readWorkbook(await file.arrayBuffer());
  } catch {
    return Response.json({ error: "That file couldn't be opened as an Excel workbook." }, { status: 400 });
  }
  if (!parsed.customers.length && !parsed.products.length) {
    return Response.json(
      { error: "No customer or product columns were found. The first rows should have headings like \"Customer Name\" and \"This Year Sales ($)\", or \"Product Code\" and \"Units in Stock\"." },
      { status: 422 },
    );
  }
  const store = await hubStore();
  if (parsed.customers.length) await store.importCustomers(parsed.customers);
  for (const p of parsed.products) await store.saveProduct(p.code, p, "upload");
  return Response.json({ notes: parsed.notes, hub: await loadHub() });
}
