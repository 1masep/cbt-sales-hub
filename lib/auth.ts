import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "owner_session";
export const SESSION_DAYS = 30;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Token format: "<expiry ms>.<signature>". Signing with SESSION_SECRET means
// it can't be forged; changing the secret logs everyone out.
export function createSessionToken(now = Date.now()): string {
  const expires = String(now + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return `${expires}.${sign(expires)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires)) return false;
  if (Number(expires) < now) return false;
  return safeEqual(signature, sign(expires));
}

export function checkPassword(input: string): boolean {
  const password = process.env.OWNER_PASSWORD;
  if (!password || password.length < 12) throw new Error("OWNER_PASSWORD must be set to at least 12 characters");
  return safeEqual(input, password);
}

// Where to go after logging in, from the ?next= link.
export function safeNextPath(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  // Only allow paths on this site. Browsers treat "//evil.com" and "/\\evil.com"
  // as other websites, so reject a second slash or any backslash or control character.
  return /^\/(?![/\\])[^\\\u0000-\u001f]*$/.test(next) ? next : "/dashboard";
}

// Slows down password guessing: after 5 wrong tries from one address,
// that address must wait 15 minutes.
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export function isLockedOut(ip: string, now = Date.now()): boolean {
  const entry = failures.get(ip);
  return !!entry && entry.count >= MAX_FAILURES && entry.until > now;
}

export function recordFailure(ip: string, now = Date.now()): void {
  const entry = failures.get(ip);
  const count = entry && entry.until > now ? entry.count + 1 : 1;
  failures.set(ip, { count, until: now + LOCKOUT_MS });
}

export function clearFailures(ip: string): void {
  failures.delete(ip);
}
