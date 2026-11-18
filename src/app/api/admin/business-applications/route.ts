import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/auth/authorization";

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

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Invalid request origin.", 403);
  const { user: actor } = await requirePlatformAdmin();

  let input: { applicationId?: unknown; status?: unknown; rejectionReason?: unknown };
  try {
    input = await request.json() as typeof input;
  } catch {
    return jsonError("A valid JSON request body is required.", 400);
  }

  const applicationId = typeof input.applicationId === "string" ? input.applicationId : "";
  const status = input.status;
  const rejectionReason = typeof input.rejectionReason === "string" ? input.rejectionReason.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)
    || !["Under Review", "Approved", "Rejected"].includes(String(status))) {
    return jsonError("Choose a valid business application and review action.", 400);
  }
  if (status === "Rejected" && (!rejectionReason || rejectionReason.length > 1000)) {
    return jsonError("A rejection reason between 1 and 1000 characters is required.", 400);
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("Business application review requires the server Supabase admin client:", error);
    return jsonError("Secure business application review is not configured on the server.", 503);
  }

  const { data: application, error: applicationError } = await admin.from("business_applications")
    .select("id,owner_user_id,business_name,email,status,deleted_at")
    .eq("id", applicationId)
    .maybeSingle();
  if (applicationError) {
    console.error("Could not load business application for review:", applicationError.message);
    return jsonError("Could not load the selected application.", 500);
  }
  if (!application) return jsonError("Business application not found.", 404);
  if (application.deleted_at) return jsonError("Business application was removed from the Admin list.", 404);
  const currentStatus = application.status.toLowerCase();
  if (!["pending", "under_review", "approved"].includes(currentStatus)) {
    return jsonError("This application can no longer be reviewed.", 409);
  }

  if (status === "Under Review" || status === "Rejected") {
    if (currentStatus === "approved") return jsonError("An approved application cannot be changed here.", 409);
    const { error } = await admin.from("business_applications")
      .update({
        status: status === "Rejected" ? "rejected" : "under_review",
        rejection_reason: status === "Rejected" ? rejectionReason : null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", applicationId)
      .in("status", ["pending", "under_review"]);
    if (error) {
      console.error("Could not update business application review:", error.message);
      return jsonError("Could not save the application review.", 500);
    }
    const { error: auditError } = await admin.from("platform_audit_logs").insert({
      actor_id: actor.id,
      action: status === "Rejected" ? "reject" : "review",
      entity: "business_application",
      record_id: applicationId,
    });
    const warning = auditError ? "Xaaladda waa la kaydiyey, balse audit log-ga lama qorin." : undefined;
    if (auditError) console.error("Application review saved but its audit log failed:", auditError.message);
    return NextResponse.json({ success: true, ...(warning ? { warning } : {}) });
  }

  if (currentStatus !== "approved") {
    const supabase = await createClient("admin");
    const { error: approvalError } = await supabase.rpc("approve_business_application", {
      application_id: applicationId,
    });
    if (approvalError) {
      console.error("Business application approval failed:", approvalError.message);
      if (approvalError.code === "23502" && approvalError.message.includes("owner_user_id")) {
        return jsonError(
          "Milkiilaha codsiga looma xirin business-ka. Ku socodsii supabase/fix-business-approval-owner.sql gudaha Supabase SQL Editor-ka.",
          503,
        );
      }
      return jsonError(`Codsiga lama ansixin: ${approvalError.message}`, 500);
    }
  }

  const { data: business, error: businessError } = await admin.from("businesses")
    .select("id,status")
    .eq("owner_user_id", application.owner_user_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (businessError || !business || business.status !== "active") {
    console.error("Approved application has no active owner business:", businessError?.message ?? "No active business found.");
    return jsonError("Codsiga waa la ansixiyey, laakiin business firfircoon lama xaqiijin karo.", 503);
  }

  const { error: revokeError } = await admin.from("business_invitations")
    .update({ status: "revoked" })
    .eq("application_id", applicationId)
    .eq("status", "pending");
  if (revokeError) {
    console.error("Could not revoke previous business invitations:", revokeError.message);
    return jsonError("Ku socodsii migration-ka business invitations ka hor intaadan ansixin milkiilaha.", 503);
  }

  const { data: ownerMembership, error: ownerMembershipError } = await admin.from("business_users")
    .select("user_id,status")
    .eq("business_id", business.id)
    .eq("user_id", application.owner_user_id)
    .maybeSingle();
  if (ownerMembershipError || !ownerMembership) {
    console.error("Could not verify the approved business owner membership:", ownerMembershipError?.message ?? "Membership not found.");
    return jsonError("Business-ka waa la ansixiyey, laakiin xubinnimada milkiilaha lama xaqiijin karo.", 503);
  }
  if (ownerMembership.status === "removed") {
    const { data: activatedMembership, error: activationError } = await admin.from("business_users")
      .update({ status: "active" })
      .eq("business_id", business.id)
      .eq("user_id", application.owner_user_id)
      .eq("status", "removed")
      .select("user_id")
      .maybeSingle();
    if (activationError || !activatedMembership) {
      console.error("Could not activate the approved business owner:", activationError?.message ?? "Membership was not updated.");
      return jsonError("Codsiga waa la ansixiyey, laakiin workspace-ka milkiilaha lama hawlgelin karin.", 503);
    }
  } else if (ownerMembership.status !== "active") {
    return jsonError("Xaaladda xubinnimada milkiilaha lama jaanqaadin ansixinta.", 409);
  }

  const { error: auditError } = await admin.from("platform_audit_logs").insert({
    actor_id: actor.id,
    action: "approve_and_activate",
    entity: "business_application",
    record_id: applicationId,
  });
  if (auditError) console.error("Business owner was activated, but its Admin audit log failed:", auditError.message);

  return NextResponse.json({
    success: true,
    ...(auditError ? { warning: "Codsiga waa la ansixiyey oo workspace-ka waa la hawlgeliyey, balse audit log-ga lama qorin." } : {}),
  });
}
