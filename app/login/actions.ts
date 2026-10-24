"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  checkPassword,
  clearFailures,
  createSessionToken,
  isLockedOut,
  recordFailure,
  safeNextPath,
  SESSION_COOKIE,
  SESSION_DAYS,
} from "../../lib/auth";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  if (isLockedOut(ip)) return { error: "Too many attempts. Try again in 15 minutes." };

  const password = formData.get("password");
  let correct: boolean;
  try {
    correct = typeof password === "string" && checkPassword(password);
  } catch (err) {
    console.error(err);
    return { error: "Login isn't set up correctly. Check OWNER_PASSWORD and SESSION_SECRET in the settings." };
  }
  if (!correct) {
    recordFailure(ip);
    return { error: "That password isn't right." };
  }

  clearFailures(ip);
  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  redirect(safeNextPath(formData.get("next")));
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
