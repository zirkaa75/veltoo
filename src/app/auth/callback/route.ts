import { NextResponse, type NextRequest } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  if (!(await isSupabaseConfigured())) {
    return NextResponse.redirect(new URL("/app/login?error=setup", request.url));
  }
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const requestedPortal = request.nextUrl.searchParams.get("portal");
  const portal = requestedPortal === "admin" || (!requestedPortal && next?.startsWith("/admin/"))
    ? "admin"
    : "business";
  const isInvitationPath = typeof next === "string"
    && /^\/business\/invitation\/[0-9a-f-]{36}$/i.test(next);
  const safeNext = portal === "admin"
    ? next === "/admin/login" || next === "/admin/set-password" ? next : "/admin/login"
    : isInvitationPath
      ? next ?? "/business/login"
      : next === "/business/set-password" || next === "/business/login"
        ? next
        : next === "/app/register/complete" || next === "/app/set-password" || next === "/app"
      ? next
      : "/app/login";

  const loginPath = portal === "admin" ? "/admin/login" : "/business/login";
  if (!code) return NextResponse.redirect(new URL(`${loginPath}?error=verification`, request.url));

  const supabase = await createClient(portal);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) return NextResponse.redirect(new URL(`${loginPath}?error=verification`, request.url));

  return NextResponse.redirect(new URL(safeNext, request.url));
}
