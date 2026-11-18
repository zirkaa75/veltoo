"use client";

import { createBrowserClient } from "@supabase/ssr";
import { authCookieName, type AuthPortal } from "./portal";

export function createClient(portal: AuthPortal = "business") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase is not configured. Set the public Supabase URL and anon key.");
  }

  return createBrowserClient(url, key, {
    cookieOptions: { name: authCookieName(portal) },
    isSingleton: false,
  });
}
