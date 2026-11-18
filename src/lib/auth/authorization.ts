import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const requirePlatformAdmin = cache(async function requirePlatformAdmin() {
  if (!(await isSupabaseConfigured())) redirect("/admin/login?error=setup");
  const supabase = await createClient("admin");
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) redirect("/admin/login");

  const { data: membership, error } = await supabase
    .from("platform_admins")
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    error ||
    !membership ||
    membership.status !== "active" ||
    membership.role !== "platform_administrator"
  ) {
    redirect("/admin/login?error=unauthorized");
  }

  return { user, role: membership.role as string };
});

export const requireSupportAgent = cache(async function requireSupportAgent() {
  if (!(await isSupabaseConfigured())) redirect("/admin/login?error=setup");
  const supabase = await createClient("admin");
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) redirect("/admin/login");

  const { data: membership, error } = await supabase
    .from("platform_admins")
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    error
    || !membership
    || membership.status !== "active"
    || !["platform_administrator", "support_staff"].includes(membership.role)
  ) {
    redirect("/admin/login?error=unauthorized");
  }

  return { user, role: membership.role as string };
});

export const requireBusinessAccount = cache(async function requireBusinessAccount() {
  if (!(await isSupabaseConfigured())) redirect("/app/login?error=setup");
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) redirect("/app/login");
  if (user.app_metadata.velto_business_access_disabled === true) {
    redirect("/app/login?error=disabled");
  }

  const { data: platformMembership, error: platformError } = await supabase
    .from("platform_admins")
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (platformError) redirect("/app/login?error=verify");
  if (
    platformMembership?.role === "platform_administrator"
    && platformMembership.status === "active"
  ) {
    redirect("/admin/dashboard");
  }

  return { user, supabase };
});

export const requireBusinessMember = cache(async function requireBusinessMember(businessId?: string) {
  const { user, supabase } = await requireBusinessAccount();
  let membershipQuery = supabase
    .from("business_users")
    .select("business_id, role, status, businesses!inner(id, name, status, category)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(2);

  if (businessId) membershipQuery = membershipQuery.eq("business_id", businessId);

  const { data: memberships, error } = await membershipQuery.eq("businesses.status", "active");

  if (error || !memberships?.length) redirect("/app/login?error=no-workspace");

  if (!businessId && memberships.length > 1) redirect("/app/select-business");

  const membership = memberships[0];
  if (!membership) redirect("/app/login?error=no-workspace");
  const { data: invitationAccess, error: invitationAccessError } = await supabase.rpc(
    "get_business_invitation_access",
    { target_business_id: membership.business_id },
  );
  if (invitationAccessError) {
    const isMissingInvitationMigration =
      invitationAccessError.code === "PGRST202"
      || invitationAccessError.code === "42883"
      || invitationAccessError.message.includes("get_business_invitation_access");
    if (!isMissingInvitationMigration) redirect("/app/login?error=verify");
    console.warn("Business invitation migration is not applied; using existing membership access.");
  } else if (
    invitationAccess
    && typeof invitationAccess === "object"
    && "required" in invitationAccess
    && invitationAccess.required === true
  ) {
    const invitationId = "invitation_id" in invitationAccess
      ? invitationAccess.invitation_id
      : null;
    if (typeof invitationId === "string" && /^[0-9a-f-]{36}$/i.test(invitationId)) {
      redirect(`/business/invitation/${invitationId}`);
    }
    redirect("/app/login?error=verify");
  }
  const { data: canViewDashboard, error: permissionError } = await supabase.rpc("has_business_permission", {
    target_business_id: membership.business_id,
    target_resource: "dashboard",
    target_action: "view",
  });
  if (permissionError) redirect("/app/login?error=verify");
  if (!canViewDashboard) redirect("/app/login?error=permission");

  const relatedBusiness = Array.isArray(membership.businesses)
    ? membership.businesses[0]
    : membership.businesses;
  if (!relatedBusiness) redirect("/app/login?error=no-workspace");

  return {
    user,
    supabase,
    membership,
    business: {
      id: String(relatedBusiness.id),
      name: String(relatedBusiness.name),
      status: String(relatedBusiness.status),
      category: String(relatedBusiness.category),
    },
  };
});
