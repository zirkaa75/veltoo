import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieName, type AuthPortal } from "./portal";

export async function isSupabaseConfigured() {
  await cookies();
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function createClient(portal: AuthPortal = "business") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase is not configured. Set the public Supabase URL and anon key.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookieOptions: { name: authCookieName(portal) },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes sessions.
        }
      },
    },
  });
}
