import { NextResponse, type NextRequest } from "next/server";
import { requireBusinessMember } from "@/lib/auth/authorization";
import { sendPlatformPush } from "@/lib/notifications/web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export const instant = false;

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  let input: { businessId?: unknown; sessionId?: unknown; action?: unknown };
  try {
    input = await request.json() as typeof input;
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  const businessId = typeof input.businessId === "string" ? input.businessId : "";
  const sessionId = typeof input.sessionId === "string" ? input.sessionId : "";
  const action = input.action;
  if (!/^[0-9a-f-]{36}$/i.test(businessId) || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return NextResponse.json({ error: "A valid business and session are required." }, { status: 400 });
  }
  if (action !== "online" && action !== "offline") {
    return NextResponse.json({ error: "A valid presence action is required." }, { status: 400 });
  }

  const { business, user } = await requireBusinessMember(businessId);
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 90_000).toISOString();

  if (action === "online") {
    const { data: activeSession, error: presenceLookupError } = await admin
      .from("platform_user_presence")
      .select("session_id")
      .eq("user_id", user.id)
      .gte("last_seen_at", cutoff)
      .limit(1)
      .maybeSingle();
    if (presenceLookupError) {
      console.error("Could not check business user presence:", presenceLookupError.message);
      return NextResponse.json({ error: "User presence could not be checked." }, { status: 503 });
    }

    const { error: upsertError } = await admin.from("platform_user_presence").upsert({
      user_id: user.id,
      business_id: business.id,
      session_id: sessionId,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "user_id,session_id" });
    if (upsertError) {
      console.error("Could not update business user presence:", upsertError.message);
      return NextResponse.json({ error: "User presence could not be saved." }, { status: 503 });
    }

    if (!activeSession) {
      const title = "Business user online";
      const body = `${user.email ?? "Business user"} wuxuu galay workspace-ka ${business.name}.`;
      const { error: notificationError } = await admin.from("platform_notifications").insert({
        title,
        message: body,
        event_type: "business_user_online",
      });
      if (notificationError) {
        console.error("Business user is online but the Admin notification failed:", notificationError.message);
      } else {
        await sendPlatformPush(title, `${business.name}: xubin ayaa galay workspace-ka.`);
      }
    }
    return NextResponse.json({ success: true, online: true });
  }

  const { data: removedSessions, error: deleteError } = await admin.from("platform_user_presence")
    .delete()
    .eq("user_id", user.id)
    .eq("session_id", sessionId)
    .select("session_id");
  if (deleteError) {
    console.error("Could not end business user presence:", deleteError.message);
    return NextResponse.json({ error: "User presence could not be ended." }, { status: 503 });
  }
  if (!removedSessions?.length) return NextResponse.json({ success: true, online: false });

  const { error: staleSessionError } = await admin.from("platform_user_presence")
    .delete()
    .eq("user_id", user.id)
    .lt("last_seen_at", cutoff);
  if (staleSessionError) {
    console.error("Could not clear stale business user sessions after logout:", staleSessionError.message);
    return NextResponse.json({ error: "Stale user sessions could not be cleared." }, { status: 503 });
  }

  const { data: otherSession, error: activeSessionsError } = await admin.from("platform_user_presence")
    .select("session_id")
    .eq("user_id", user.id)
    .gte("last_seen_at", cutoff)
    .limit(1)
    .maybeSingle();
  if (activeSessionsError) {
    console.error("Could not check remaining business user sessions:", activeSessionsError.message);
    return NextResponse.json({ error: "Remaining user sessions could not be checked." }, { status: 503 });
  }
  if (!otherSession) {
    const title = "Business user offline";
    const body = `${user.email ?? "Business user"} wuxuu ka baxay workspace-ka ${business.name}.`;
    const { error: notificationError } = await admin.from("platform_notifications").insert({
      title,
      message: body,
      event_type: "business_user_offline",
    });
    if (notificationError) {
      console.error("Business user is offline but the Admin notification failed:", notificationError.message);
    } else {
      await sendPlatformPush(title, `${business.name}: xubin ayaa ka baxay workspace-ka.`);
    }
  }
  return NextResponse.json({ success: true, online: Boolean(otherSession) });
}
