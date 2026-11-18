import { NextResponse, type NextRequest } from "next/server";
import { requireBusinessMember } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBusinessWorkspaceConfig, workspaceAllowsModule } from "@/lib/workspace/config";

export const instant = false;

const assignableRoles = new Set([
  "business_admin",
  "manager",
  "accountant",
  "sales_staff",
  "inventory_manager",
  "employee",
]);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function removeCreatedAccount(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (!error) return false;
  console.error("Could not remove orphaned business account:", error.message);
  return true;
}

async function checkPermission(
  supabase: Awaited<ReturnType<typeof requireBusinessMember>>["supabase"],
  businessId: string,
  action: "create" | "delete",
) {
  const { data, error } = await supabase.rpc("has_business_permission", {
    target_business_id: businessId,
    target_resource: "team",
    target_action: action,
  });
  if (error) {
    console.error("Could not verify business team permission:", error.message);
    return { allowed: false, error: "Rukhsadda kooxda lama xaqiijin karo." };
  }
  return { allowed: Boolean(data), error: null };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> },
) {
  if (!sameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const { businessId: requestedBusinessId } = await params;
  const { business, user, supabase } = await requireBusinessMember(requestedBusinessId);
  const { config, error: configError } = await loadBusinessWorkspaceConfig(supabase, business.id);
  if (configError) return errorResponse("Workspace configuration could not be verified.", 503);
  if (!workspaceAllowsModule(config, "team")) return errorResponse("Kooxda laguma darin subscription plan-kan.", 403);
  const permission = await checkPermission(supabase, business.id, "create");
  if (permission.error) return errorResponse(permission.error, 503);
  if (!permission.allowed) return errorResponse("Doorkaagu ma oggola ku darista xubnaha.", 403);

  let input: { email?: unknown; displayName?: unknown; role?: unknown; sharedPassword?: unknown };
  try {
    input = await request.json() as {
      email?: unknown;
      displayName?: unknown;
      role?: unknown;
      sharedPassword?: unknown;
    };
  } catch {
    return errorResponse("Codsi JSON sax ah ayaa loo baahan yahay.", 400);
  }
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  const role = typeof input.role === "string" ? input.role : "";
  const sharedPassword = typeof input.sharedPassword === "string" ? input.sharedPassword : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return errorResponse("Email sax ah geli.", 400);
  }
  if (!displayName || displayName.length > 120 || !assignableRoles.has(role)) {
    return errorResponse("Magaca ama doorka xubinta ma saxna.", 400);
  }
  if (user.email?.trim().toLowerCase() === email) {
    return errorResponse("Akoonkaaga dib looguma dari karo kooxda.", 409);
  }
  if (sharedPassword.length < 12 || new TextEncoder().encode(sharedPassword).length > 72) {
    return errorResponse("Password-ka wadaagga ahi waa inuu ahaadaa 12 ilaa 72 byte.", 400);
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (adminError) {
    const message = adminError instanceof Error ? adminError.message : "";
    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return errorResponse(
        "Akoon cusub lama samayn karo: SUPABASE_SERVICE_ROLE_KEY laguma dejin server-ka. Ku dar furaha server environment-ka oo dib u bilow app-ka. Ha gelin furahan browser-ka ama ha ku wadaagin chat-ka.",
        503,
      );
    }
    return errorResponse("Adeegga samaynta akoonka server-ka lama diyaarin.", 503);
  }

  const { error: schemaError } = await admin.from("business_users")
    .select("user_id,display_name,email,role,status,created_at")
    .limit(0);
  if (schemaError) {
    console.error("Could not verify business team schema:", schemaError.message);
    if (
      schemaError.code === "42703"
      && (schemaError.message.includes("display_name") || schemaError.message.includes("email"))
    ) {
      return errorResponse(
        "Database-ka business_users waxaa ka maqan display_name ama email. Ku socodsii supabase/fix-business-users-contact-fields.sql gudaha Supabase SQL Editor ka hor intaadan xubno cusub ku darin.",
        503,
      );
    }
    return errorResponse(`Schema-ga kooxda lama xaqiijin karo: ${schemaError.message}`, 503);
  }

  const { data: existingEmailMembership, error: existingEmailMembershipError } = await admin.from("business_users")
    .select("business_id")
    .eq("email", email)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (existingEmailMembershipError) {
    console.error("Could not verify existing email membership:", existingEmailMembershipError.message);
    return errorResponse("Akoonka email-kan lama xaqiijin karo inuu ganacsi kale ka tirsan yahay.", 503);
  }
  if (existingEmailMembership) {
    return errorResponse(
      "Email-kan wuxuu hore uga tirsan yahay workspace ganacsi. Isticmaal email cusub si aan akoon hore loogu dari karin business kale.",
      409,
    );
  }

  const { data: accountData, error: accountError } = await admin.auth.admin.createUser({
    email,
    password: sharedPassword,
    email_confirm: true,
    user_metadata: { full_name: displayName },
  });
  const account = accountData.user;
  if (accountError || !account) {
    const message = accountError?.message ?? "Supabase ma soo celin akoonka cusub.";
    console.error("Could not create business team account:", message);
    if (/already|registered|duplicate|exists/i.test(message)) {
      return errorResponse("Email-kan hore ayuu akoon ugu xiran yahay. Isticmaal email aan hore loo diiwaangelin.", 409);
    }
    return errorResponse("Akoonka xubinta lama samayn. Hubi Auth settings-ka kadibna isku day mar kale.", 500);
  }

  const { error: memberError } = await admin.from("business_users").insert({
    business_id: business.id,
    user_id: account.id,
    display_name: displayName,
    email,
    role,
    status: "active",
  });
  if (memberError) {
    const cleanupFailed = await removeCreatedAccount(admin, account.id);
    const cleanupNotice = cleanupFailed
      ? " Akoonka Auth-ka waa la sameeyay balse si otomaatig ah looma tirtiri karin; maamulaha ha hubiyo."
      : "";
    if (
      memberError.code === "22P02"
      && memberError.message.includes("membership_role")
    ) {
      return errorResponse(
        `Doorka la doortay kuma jiro membership_role enum-ka Supabase. Xubinnimada lama samayn. Ku socodsii supabase/inspect-membership-roles.sql gudaha Supabase SQL Editor si doorka saxda ah loogu xiro.${cleanupNotice}`,
        422,
      );
    }
    console.error("Could not add business team membership:", memberError.message);
    return errorResponse(`Xubinta laguma darin ganacsigan.${cleanupNotice}`, 500);
  }

  const { error: auditError } = await admin.from("business_audit_logs").insert({
    business_id: business.id,
    actor_id: user.id,
    action: "create",
    entity: "business_user",
    record_id: account.id,
  });
  let auditWarning: string | undefined;
  if (auditError) {
    console.error("Business member was added but its audit event could not be saved:", auditError.message);
    auditWarning = "Xubinta waa lagu daray, balse audit log-ga lama kaydin. Ku socodsii supabase/create-business-audit-logs.sql gudaha Supabase SQL Editor.";
  }

  return NextResponse.json({
    id: account.id,
    email,
    ...(auditWarning ? { warning: auditWarning } : {}),
  }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> },
) {
  if (!sameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const { businessId: requestedBusinessId } = await params;
  const { business, user, supabase } = await requireBusinessMember(requestedBusinessId);
  const { config, error: configError } = await loadBusinessWorkspaceConfig(supabase, business.id);
  if (configError) return errorResponse("Workspace configuration could not be verified.", 503);
  if (!workspaceAllowsModule(config, "team")) return errorResponse("Kooxda laguma darin subscription plan-kan.", 403);
  const permission = await checkPermission(supabase, business.id, "delete");
  if (permission.error) return errorResponse(permission.error, 503);
  if (!permission.allowed) return errorResponse("Doorkaagu ma oggola saarista xubnaha.", 403);

  let input: { userId?: unknown };
  try {
    input = await request.json() as { userId?: unknown };
  } catch {
    return errorResponse("Codsi JSON sax ah ayaa loo baahan yahay.", 400);
  }
  const targetUserId = typeof input.userId === "string" ? input.userId : "";
  if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) return errorResponse("Xubin sax ah dooro.", 400);
  if (targetUserId === user.id) return errorResponse("Xubin naftaada ah lama saari karo.", 409);

  let admin;
  try {
    admin = createAdminClient();
  } catch (adminError) {
    const message = adminError instanceof Error ? adminError.message : "Server Auth Admin lama dejin.";
    return errorResponse(message, 503);
  }

  const { data: target, error: targetError } = await admin.from("business_users")
    .select("user_id,role,status")
    .eq("business_id", business.id)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (targetError) return errorResponse(`Xubinta lama xaqiijin karo: ${targetError.message}`, 500);
  if (!target || target.status !== "active") return errorResponse("Xubin firfircoon lama helin.", 404);
  if (target.role === "owner") return errorResponse("Mulkiilaha ganacsiga lama saari karo.", 409);

  const { error: removeError } = await admin.from("business_users")
    .update({ status: "removed" })
    .eq("business_id", business.id)
    .eq("user_id", targetUserId);
  if (removeError) return errorResponse(`Xubinta lama saarin: ${removeError.message}`, 500);

  const { error: auditError } = await admin.from("business_audit_logs").insert({
    business_id: business.id,
    actor_id: user.id,
    action: "remove",
    entity: "business_user",
    record_id: targetUserId,
  });
  if (auditError) {
    console.error("Business member was removed but its audit event could not be saved:", auditError.message);
    return NextResponse.json({
      id: targetUserId,
      warning: "Xubinta waa laga saaray workspace-ka, balse audit log-ga lama kaydin. Ku socodsii supabase/create-business-audit-logs.sql gudaha Supabase SQL Editor.",
    });
  }

  return NextResponse.json({ id: targetUserId });
}
