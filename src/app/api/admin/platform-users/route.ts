import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/authorization";
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

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Invalid request origin.", 403);
  const { user: actor } = await requirePlatformAdmin();

  let input: { email?: unknown; displayName?: unknown };
  try {
    input = await request.json() as { email?: unknown; displayName?: unknown };
  } catch {
    return jsonError("A valid JSON request body is required.", 400);
  }

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return jsonError("Enter a valid email address.", 400);
  }
  if (!displayName || displayName.length > 120) {
    return jsonError("Enter a name between 1 and 120 characters.", 400);
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server Auth Admin is not configured.";
    return jsonError(message, 503);
  }

  const redirectTo = new URL(
    "/auth/callback?next=%2Fadmin%2Fset-password&portal=admin",
    request.nextUrl.origin,
  ).toString();
  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: displayName },
    redirectTo,
  });
  if (inviteError || !invitation.user) {
    return jsonError(inviteError?.message ?? "Supabase did not return the invited user.", 400);
  }

  const { error: membershipError } = await admin.from("platform_admins").insert({
    user_id: invitation.user.id,
    role: "platform_administrator",
    status: "active",
    display_name: displayName,
    email,
  });
  if (membershipError) {
    return jsonError(
      `Could not create the platform membership: ${membershipError.message}. The Auth invitation remains pending.`,
      500,
    );
  }

  const { error: auditError } = await admin.from("platform_audit_logs").insert({
    actor_id: actor.id,
    action: "invite",
    entity: "platform_admin",
    record_id: invitation.user.id,
  });
  if (auditError) {
    const { error: memberCleanupError } = await admin.from("platform_admins").delete().eq("user_id", invitation.user.id);
    if (memberCleanupError) console.error("Could not roll back platform membership after audit failure:", memberCleanupError.message);
    return jsonError(
      `Invitation membership was rolled back because its audit log could not be written: ${auditError.message}. The Auth invitation may remain pending.`,
      500,
    );
  }

  return NextResponse.json({ id: invitation.user.id, email }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Invalid request origin.", 403);
  const { user: actor } = await requirePlatformAdmin();

  let input: { userId?: unknown };
  try {
    input = await request.json() as { userId?: unknown };
  } catch {
    return jsonError("A valid JSON request body is required.", 400);
  }

  const userId = typeof input.userId === "string" ? input.userId : "";
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return jsonError("A valid platform user ID is required.", 400);
  if (userId === actor.id) return jsonError("You cannot remove your own Super Admin account.", 409);

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server Auth Admin is not configured.";
    return jsonError(message, 503);
  }

  const { data: target, error: targetError } = await admin.from("platform_admins")
    .select("user_id,role,status").eq("user_id", userId).maybeSingle();
  if (targetError) return jsonError(`Could not verify the platform account: ${targetError.message}`, 500);
  if (!target || target.role !== "platform_administrator") {
    return jsonError("Only a Super Admin account can be removed here.", 404);
  }

  const { count, error: countError } = await admin.from("platform_admins")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "platform_administrator")
    .eq("status", "active");
  if (countError) return jsonError(`Could not verify active Super Admin accounts: ${countError.message}`, 500);
  if ((count ?? 0) <= 1 && target.status === "active") {
    return jsonError("The last active Super Admin cannot be removed.", 409);
  }

  const { error: auditRequestError } = await admin.from("platform_audit_logs").insert({
    actor_id: actor.id,
    action: "remove_requested",
    entity: "platform_admin",
    record_id: userId,
  });
  if (auditRequestError) return jsonError(`Could not record the removal request: ${auditRequestError.message}`, 500);

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);
  if (deleteAuthError) return jsonError(`Could not remove the Auth account: ${deleteAuthError.message}`, 500);

  const { error: deleteMembershipError } = await admin.from("platform_admins").delete().eq("user_id", userId);
  if (deleteMembershipError) {
    console.error("Auth account was removed but platform membership cleanup failed:", deleteMembershipError.message);
    return jsonError("The Auth account was removed, but platform membership cleanup failed. Contact support.", 500);
  }

  const { error: auditCompleteError } = await admin.from("platform_audit_logs").insert({
    actor_id: actor.id,
    action: "remove",
    entity: "platform_admin",
    record_id: userId,
  });
  if (auditCompleteError) {
    console.error("Platform user removal completed but completion audit failed:", auditCompleteError.message);
    return jsonError("The account was removed, but its completion audit could not be recorded.", 500);
  }

  return NextResponse.json({ id: userId });
}
