// Sales are small; anything bigger than this is a mistake or an attack.
export const MAX_BODY_BYTES = 64 * 1024;

export type JsonResult = { ok: true; value: unknown } | { ok: false; status: number; error: string };

export async function readJson(request: Request): Promise<JsonResult> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) return { ok: false, status: 413, error: "Request is too large" };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "Request is too large" };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "Body must be valid JSON" };
  }
}
