import { beforeAll, describe, expect, it } from "vitest";
import { checkPassword, createSessionToken, isLockedOut, recordFailure, safeNextPath, verifySessionToken } from "../lib/auth";

beforeAll(() => {
  process.env.SESSION_SECRET = "x".repeat(40);
  process.env.OWNER_PASSWORD = "correct horse battery staple";
});

describe("owner login", () => {
  it("checks the password exactly", () => {
    expect(checkPassword("correct horse battery staple")).toBe(true);
    expect(checkPassword("correct horse battery")).toBe(false);
    expect(checkPassword("")).toBe(false);
  });

  it("accepts its own session token until it expires", () => {
    const now = Date.now();
    const token = createSessionToken(now);
    expect(verifySessionToken(token, now)).toBe(true);
    expect(verifySessionToken(token, now + 31 * 24 * 60 * 60 * 1000)).toBe(false);
  });

  it("rejects forged or tampered tokens", () => {
    const [expires, sig] = createSessionToken().split(".");
    expect(verifySessionToken(`${Number(expires) + 1000}.${sig}`)).toBe(false);
    expect(verifySessionToken(`${expires}.forged`)).toBe(false);
    expect(verifySessionToken("garbage")).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
  });

  it("logs everyone out when the secret changes", () => {
    const token = createSessionToken();
    process.env.SESSION_SECRET = "y".repeat(40);
    expect(verifySessionToken(token)).toBe(false);
  });

  it("locks an address out after 5 wrong passwords", () => {
    const now = Date.now();
    for (let i = 0; i < 4; i++) recordFailure("1.2.3.4", now);
    expect(isLockedOut("1.2.3.4", now)).toBe(false);
    recordFailure("1.2.3.4", now);
    expect(isLockedOut("1.2.3.4", now)).toBe(true);
    expect(isLockedOut("1.2.3.4", now + 16 * 60 * 1000)).toBe(false);
    expect(isLockedOut("5.6.7.8", now)).toBe(false);
  });
});

describe("login redirect", () => {
  it.each(["/dashboard", "/dashboard?x=1", "/a/b"])("allows %s", (next) => {
    expect(safeNextPath(next)).toBe(next);
  });

  it.each(["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "evil.com", "/\tevil", "", null])(
    "sends %s to the dashboard instead",
    (next) => {
      expect(safeNextPath(next)).toBe("/dashboard");
    },
  );
});

describe("password setting", () => {
  it("refuses a password shorter than 12 characters", () => {
    const saved = process.env.OWNER_PASSWORD;
    process.env.OWNER_PASSWORD = "short";
    expect(() => checkPassword("short")).toThrow(/at least 12/);
    process.env.OWNER_PASSWORD = saved;
  });
});
