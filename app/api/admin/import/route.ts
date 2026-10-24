import { extractSales, FILE_TYPES, ImportError, importSource, type ImportSource } from "../../../../lib/ai-import";
import { getDraftsRepo, getRepo } from "../../../../lib/repo";
import { salesStore } from "../../../../lib/sales-repo";
import { isOwner } from "../../../../lib/session";

// Reading a long PDF or a web page can take a minute or two.
export const maxDuration = 300;

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;

const fail = (status: number, error: string) => Response.json({ error }, { status });

async function readSource(form: FormData): Promise<ImportSource | string> {
  const text = form.get("text");
  const url = form.get("url");
  const file = form.get("file");
  const given = [typeof text === "string" && text.trim(), typeof url === "string" && url.trim(), file instanceof File && file.size > 0].filter(Boolean);
  if (given.length !== 1) return "Give the AI one thing to read: pasted text, a file, or a link.";

  if (typeof text === "string" && text.trim()) {
    if (text.length > MAX_TEXT_CHARS) return "That text is too long. Paste one order or invoice at a time.";
    return { kind: "text", text: text.trim() };
  }
  if (typeof url === "string" && url.trim()) {
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      return "That link isn't a valid web address.";
    }
    if (!["http:", "https:"].includes(parsed.protocol)) return "Links must start with http:// or https://.";
    return { kind: "url", url: parsed.toString() };
  }
  const upload = file as File;
  if (upload.size > MAX_FILE_BYTES) return "Files must be 10 MB or smaller.";
  if (!(FILE_TYPES as readonly string[]).includes(upload.type)) return "Upload a PDF or an image (PNG, JPG, GIF or WebP).";
  return { kind: "file", name: upload.name, mediaType: upload.type, base64: Buffer.from(await upload.arrayBuffer()).toString("base64") };
}

export async function POST(request: Request) {
  if (!(await isOwner())) return fail(401, "Not logged in");
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return fail(503, "AI import isn't set up yet: add ANTHROPIC_API_KEY to the app's settings.");
  }
  if (Number(request.headers.get("content-length")) > MAX_FILE_BYTES + 1024 * 1024) return fail(413, "Files must be 10 MB or smaller.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Couldn't read the upload.");
  }
  const source = await readSource(form);
  if (typeof source === "string") return fail(400, source);

  try {
    const [repo, drafts] = await Promise.all([getRepo(), getDraftsRepo()]);
    const result = await importSource(source, { extract: (s) => extractSales(s), sales: salesStore(repo), drafts });
    return Response.json(result);
  } catch (err) {
    if (err instanceof ImportError) return fail(422, err.message);
    console.error("AI import failed", err);
    return fail(500, "Something went wrong reading that. Try again.");
  }
}
