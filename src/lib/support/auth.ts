import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SupportAuthError = { ok: false; status: number; error: string };

export async function getSupportAgent() {
  const supabase = await createClient("admin");
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false as const, status: 401, error: "Fadlan ku gal akoonka maamulka." };

  const admin = createAdminClient();
  const { data: membership, error } = await admin.from("platform_admins")
    .select("role,status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("Could not verify support-agent membership:", error.message);
    return { ok: false as const, status: 503, error: "Xaqiijinta kooxda support-ka way fashilantay." };
  }
  if (
    !membership
    || membership.status !== "active"
    || !["platform_administrator", "support_staff"].includes(membership.role)
  ) {
    return { ok: false as const, status: 403, error: "Koontadani ma geli karto WhatsApp Support Center." };
  }

  return { ok: true as const, user, role: membership.role as string, admin };
}

export async function getBusinessSupportContext(businessId: string) {
  const supabase = await createClient("business");
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false as const, status: 401, error: "Fadlan ku gal akoonka business-ka." };
  }
  if (user.app_metadata.velto_business_access_disabled === true) {
    return { ok: false as const, status: 403, error: "Gelitaanka workspace-ka waa la hakiyey." };
  }

  const admin = createAdminClient();
  const { data: membership, error: membershipError } = await admin.from("business_users")
    .select("business_id,status")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) {
    console.error("Could not verify support business membership:", membershipError.message);
    return { ok: false as const, status: 503, error: "Xaqiijinta xubinimada business-ka way fashilantay." };
  }
  if (!membership) return { ok: false as const, status: 403, error: "Business-kan ma lihid gelitaan." };

  const { data: business, error: businessError } = await admin.from("businesses")
    .select("id,name,owner_name,owner_email,phone,status,owner_user_id")
    .eq("id", businessId)
    .maybeSingle();
  if (businessError) {
    console.error("Could not load support business details:", businessError.message);
    return { ok: false as const, status: 503, error: "Xogta business-ka lama soo qaadi karin." };
  }
  if (!business || business.status !== "active") {
    return { ok: false as const, status: 403, error: "Business-kan hadda ma shaqaynayo." };
  }

  return { ok: true as const, user, admin, business };
}

export function supportAuthResponse(error: SupportAuthError) {
  return Response.json({ error: error.error }, { status: error.status });
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
