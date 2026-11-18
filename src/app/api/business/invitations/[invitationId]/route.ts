import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ invitationId: string }> };

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { invitationId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) return jsonError("Martiqaad sax ah lama helin.", 404);

  const supabase = await createClient("business");
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Fadlan ku gal akoonka milkiilaha lagu martiqaaday.", 401);

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("Business invitation lookup requires the server admin client:", error);
    return jsonError("Adeegga martiqaadka si ammaan ah looma diyaarin.", 503);
  }

  const { data: invitation, error: invitationError } = await admin.from("business_invitations")
    .select("id,business_id,user_id,email,status,expires_at")
    .eq("id", invitationId)
    .maybeSingle();
  if (invitationError) {
    console.error("Could not verify business invitation:", invitationError.message);
    return jsonError("Ku socodsii migration-ka business invitations ka hor intaadan link-ga furin.", 503);
  }
  if (!invitation || invitation.user_id !== user.id) return jsonError("Martiqaadkan kuma xidhna akoonka aad ku gashay.", 403);

  if (invitation.status === "accepted") {
    return NextResponse.json({ status: "accepted", businessId: invitation.business_id });
  }
  if (invitation.status !== "pending" || new Date(invitation.expires_at).getTime() <= Date.now()) {
    if (invitation.status === "pending") {
      const { error } = await admin.from("business_invitations")
        .update({ status: "expired" })
        .eq("id", invitationId)
        .eq("status", "pending");
      if (error) console.error("Could not mark expired business invitation:", error.message);
    }
    return NextResponse.json({ status: "expired" }, { status: 410 });
  }

  const { data: business, error: businessError } = await admin.from("businesses")
    .select("name,status")
    .eq("id", invitation.business_id)
    .maybeSingle();
  if (businessError) {
    console.error("Could not verify invited business:", businessError.message);
    return jsonError("Xaaladda business-ka martiqaadka lama xaqiijin karo.", 500);
  }
  if (!business || business.status !== "active") return jsonError("Business-kan hadda ma shaqaynayo.", 403);

  return NextResponse.json({
    status: "pending",
    email: invitation.email,
    businessName: business.name,
    expiresAt: invitation.expires_at,
  });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!isSameOrigin(request)) return jsonError("Invalid request origin.", 403);
  const { invitationId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) return jsonError("Martiqaad sax ah lama helin.", 404);

  const supabase = await createClient("business");
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Xaqiijinta email-ka lama helin. Ka fur link-ga email-ka mar kale.", 401);

  const { data: businessId, error: consumeError } = await supabase.rpc("consume_business_invitation", {
    target_invitation_id: invitationId,
  });
  if (consumeError || typeof businessId !== "string") {
    console.error("Could not accept business invitation:", consumeError?.message ?? "No business ID returned.");
    if (consumeError?.code === "P0002") return jsonError("Martiqaadku wuu dhacay ama hore ayaa loo isticmaalay.", 410);
    if (consumeError?.code === "PGRST202" || consumeError?.code === "42883") {
      return jsonError("Ku socodsii supabase/migrations/20261117001000_business_invitations.sql ka hor intaadan martiqaadka aqbalin.", 503);
    }
    return jsonError("Martiqaadka lama xaqiijin karo. Hubi migration-ka kadibna isku day mar kale.", 500);
  }

  return NextResponse.json({ businessId });
}
