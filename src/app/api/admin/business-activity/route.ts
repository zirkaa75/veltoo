import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/authorization";
import { sendPlatformPush } from "@/lib/notifications/web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export const instant = false;

export async function GET() {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { data: applications, error: applicationError } = await admin
    .from("business_applications")
    .select("owner_user_id,email,business_name");
  if (applicationError) {
    console.error("Could not load business application owners for presence:", applicationError.message);
    return NextResponse.json({ error: "Business user presence could not be loaded." }, { status: 503 });
  }

  const owners = new Map((applications ?? []).map((item) => [item.owner_user_id, item]));
  const ownerIds = [...owners.keys()];
  if (!ownerIds.length) return NextResponse.json({ presence: {} }, { headers: { "Cache-Control": "private, no-store" } });

  const cutoff = new Date(Date.now() - 90_000).toISOString();
  const { data: sessions, error: sessionError } = await admin
    .from("platform_user_presence")
    .select("user_id,last_seen_at")
    .in("user_id", ownerIds)
    .gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false });
  if (sessionError) {
    console.error("Could not load active business user presence:", sessionError.message);
    return NextResponse.json({ error: "Business user presence could not be loaded. Apply the activity migration." }, { status: 503 });
  }

  const { data: expiredSessions, error: expireError } = await admin.from("platform_user_presence")
    .delete()
    .in("user_id", ownerIds)
    .lt("last_seen_at", cutoff)
    .select("user_id");
  if (expireError) {
    console.error("Could not clear expired business user sessions:", expireError.message);
    return NextResponse.json({ error: "Expired business user sessions could not be updated." }, { status: 503 });
  }

  const presence: Record<string, { online: boolean; lastSeenAt: string }> = {};
  for (const session of sessions ?? []) {
    presence[session.user_id] ??= { online: true, lastSeenAt: session.last_seen_at };
  }

  const expiredOwnerIds = [...new Set((expiredSessions ?? [])
    .map((session) => session.user_id)
    .filter((userId) => !presence[userId]))];
  for (const ownerId of expiredOwnerIds) {
    const owner = owners.get(ownerId);
    if (!owner) continue;
    const title = "Business user offline";
    const message = `${owner.email} wuxuu ka baxay workspace-ka ${owner.business_name}.`;
    const { error } = await admin.from("platform_notifications").insert({
      title,
      message,
      event_type: "business_user_offline",
    });
    if (error) console.error("Business user went offline but the Admin notification failed:", error.message);
    else await sendPlatformPush(title, `${owner.business_name}: xubin ayaa ka baxay workspace-ka.`);
  }

  return NextResponse.json({ presence }, { headers: { "Cache-Control": "private, no-store" } });
}
