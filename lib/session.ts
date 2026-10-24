import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./auth";

// Second check inside handlers, in case the proxy matcher is ever changed.
export async function isOwner(): Promise<boolean> {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}
