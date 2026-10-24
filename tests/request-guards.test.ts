import { describe, expect, it } from "vitest";
import { MAX_BODY_BYTES, readJson } from "../lib/read-json";
import { parseFilters } from "../lib/sales-repo";

const filters = (query: string) => parseFilters(new URLSearchParams(query));

describe("readJson", () => {
  const req = (body: string) => new Request("http://x/", { method: "POST", body });

  it("parses a normal body", async () => {
    expect(await readJson(req('{"a":1}'))).toEqual({ ok: true, value: { a: 1 } });
  });

  it("rejects bodies over the size limit with 413", async () => {
    const result = await readJson(req(JSON.stringify({ pad: "x".repeat(MAX_BODY_BYTES) })));
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  it("rejects invalid JSON with 400", async () => {
    expect(await readJson(req("{bad"))).toMatchObject({ ok: false, status: 400 });
    expect(await readJson(req(""))).toMatchObject({ ok: false, status: 400 });
  });
});

describe("parseFilters", () => {
  it.each(["__proto__", "toString", "constructor", "hasOwnProperty"])("ignores sort=%s", (sort) => {
    expect(filters(`sort=${sort}`).sort).toBe("date");
  });

  it.each(["2026-13-45", "2026-02-30", "2026-1-1", "garbage"])("ignores impossible date %s", (from) => {
    expect(filters(`from=${from}`).from).toBeUndefined();
  });

  it("keeps a real date", () => {
    expect(filters("from=2028-02-29").from).toBe("2028-02-29");
  });

  it("strips control characters and caps search length", () => {
    expect(filters("q=ab%00c").q).toBe("abc");
    expect(filters("q=%00").q).toBeUndefined();
    expect(filters(`q=${"a".repeat(5000)}`).q).toHaveLength(200);
  });
});
