import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

type RouteContext = { params: Promise<{ applicationId: string }> };
type Row = Record<string, unknown>;
const workspaceTables = [
  "products",
  "customers",
  "suppliers",
  "branches",
  "sales",
  "invoices",
  "product_images",
  "business_settings",
] as const;
const productImageBucket = "velto-product-images";
const storagePageSize = 100;
type AdminClient = ReturnType<typeof createAdminClient>;

async function listBusinessStoragePaths(
  admin: AdminClient,
  businessId: string,
): Promise<{ paths: string[]; error?: string }> {
  const paths: string[] = [];
  const prefixes = [businessId];

  while (prefixes.length) {
    const prefix = prefixes.pop();
    if (!prefix) continue;

    let offset = 0;
    while (true) {
      const { data, error } = await admin.storage.from(productImageBucket).list(prefix, {
        limit: storagePageSize,
        offset,
      });
      if (error) return { paths: [], error: error.message };

      const entries = data ?? [];
      for (const entry of entries) {
        const path = `${prefix}/${entry.name}`;
        if (entry.id === null) prefixes.push(path);
        else paths.push(path);
      }

      if (entries.length < storagePageSize) break;
      offset += entries.length;
    }
  }

  return { paths };
}

async function removeBusinessStorage(
  admin: AdminClient,
  businessIds: string[],
): Promise<string | null> {
  const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
  if (bucketError) return bucketError.message;
  if (!buckets?.some((bucket) => bucket.name === productImageBucket)) return null;

  for (const businessId of businessIds) {
    const { paths, error } = await listBusinessStoragePaths(admin, businessId);
    if (error) return error;

    for (let offset = 0; offset < paths.length; offset += storagePageSize) {
      const { error: removeError } = await admin.storage.from(productImageBucket)
        .remove(paths.slice(offset, offset + storagePageSize));
      if (removeError) return removeError.message;
    }
  }

  return null;
}

function isMissingAuthUser(error: { status?: number; code?: string } | null) {
  return error?.status === 404 || error?.code === "user_not_found";
}

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

function safeRecord(row: Row) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !/password|secret|token|(^|_)key($|_)/i.test(key)),
  );
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  await requirePlatformAdmin();
  const { applicationId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return jsonError("Invalid application ID.", 400);

  const admin = createAdminClient();
  const { data: application, error: applicationError } = await admin.from("business_applications")
    .select("id,owner_user_id,business_name,owner_name,email,phone,category,status,rejection_reason,created_at,deleted_at")
    .eq("id", applicationId)
    .maybeSingle();
  if (applicationError) {
    console.error("Could not load business application details:", applicationError.message);
    return jsonError("Codsiga ganacsiga lama soo qaadi karin.", 500);
  }
  if (!application) return jsonError("Business application not found.", 404);
  if (application.deleted_at) return jsonError("Codsigan waxaa laga saaray liiska maamulka.", 404);
  if (typeof application.owner_user_id !== "string" || !/^[0-9a-f-]{36}$/i.test(application.owner_user_id)) {
    return jsonError("Codsigan lama xiriirin user account sax ah.", 409);
  }

  const requestedTable = request.nextUrl.searchParams.get("table");
  if (requestedTable) {
    if (!workspaceTables.includes(requestedTable as (typeof workspaceTables)[number])) {
      return jsonError("Unknown business workspace data table.", 400);
    }
    const rawOffset = request.nextUrl.searchParams.get("offset") ?? "0";
    const offset = Number(rawOffset);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
      return jsonError("Invalid workspace data offset.", 400);
    }
    const { data: business, error: businessError } = await admin.from("businesses")
      .select("id")
      .eq("owner_user_id", application.owner_user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (businessError) {
      console.error("Could not verify workspace data ownership:", businessError.message);
      return jsonError("Xogta business-ka lama xaqiijin karo.", 500);
    }
    if (!business) return jsonError("Business workspace not found.", 404);

    const { data, count, error } = await admin.from(requestedTable)
      .select("*", { count: "exact" })
      .eq("business_id", business.id)
      .range(offset, offset + 99);
    if (error) {
      console.error(`Could not load ${requestedTable} business records:`, error.message);
      return jsonError("Xogta workspace-ka lama soo qaadi karin.", 500);
    }
    return NextResponse.json({
      dataset: {
        table: requestedTable,
        offset,
        count: count ?? data?.length ?? 0,
        records: ((data ?? []) as Row[]).map(safeRecord),
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const [authResult, businessResult] = await Promise.all([
    admin.auth.admin.getUserById(application.owner_user_id),
    admin.from("businesses").select("*").eq("owner_user_id", application.owner_user_id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (authResult.error) {
    console.error("Could not load business owner account details:", authResult.error.message);
    return jsonError("Akoonka milkiilaha lama xaqiijin karo.", 500);
  }
  if (businessResult.error) {
    console.error("Could not load business profile details:", businessResult.error.message);
    return jsonError("Xogta business-ka lama soo qaadi karin.", 500);
  }

  let members: { userId: string; email: string; name: string; role: string; status: string; joinedAt: string }[] = [];
  let workspaceData: { table: string; count: number | null; records: Row[]; error?: string }[] = [];
  let online = false;
  if (businessResult.data) {
    const businessId = String(businessResult.data.id);
    const [membersResult, presenceResult] = await Promise.all([
      admin.from("business_users")
        .select("user_id,role,status,created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(100),
      admin.from("platform_user_presence")
        .select("session_id")
        .eq("user_id", application.owner_user_id)
        .gte("last_seen_at", new Date(Date.now() - 90_000).toISOString())
        .limit(1)
        .maybeSingle(),
    ]);
    if (membersResult.error) {
      console.error("Could not load business workspace members:", membersResult.error.message);
      return jsonError("Xubnaha workspace-ka lama soo qaadi karin.", 500);
    }
    if (presenceResult.error) {
      console.error("Could not load business owner presence:", presenceResult.error.message);
      return jsonError("Xaaladda online/offline lama soo qaadi karin. Apply the activity migration.", 503);
    }
    online = Boolean(presenceResult.data);

    members = await Promise.all((membersResult.data ?? []).map(async (member) => {
      const { data: memberUser, error } = await admin.auth.admin.getUserById(member.user_id);
      if (error) console.error("Could not load a business member email:", error.message);
      return {
        userId: member.user_id,
        email: memberUser?.user?.email ?? "",
        name: typeof memberUser?.user?.user_metadata.full_name === "string" ? memberUser.user.user_metadata.full_name : "",
        role: String(member.role),
        status: String(member.status),
        joinedAt: String(member.created_at),
      };
    }));

    workspaceData = await Promise.all(workspaceTables.map(async (table) => {
      const { data, count, error } = await admin.from(table)
        .select("*", { count: "exact" })
        .eq("business_id", businessId)
        .limit(100);
      if (error) {
        console.error(`Could not load ${table} for business review:`, error.message);
        return { table, count: null, records: [], error: error.message };
      }
      return {
        table,
        count: count ?? data?.length ?? 0,
        records: ((data ?? []) as Row[]).map(safeRecord),
      };
    }));
  }

  const owner = authResult.data.user;
  return NextResponse.json({
    application,
    account: owner ? {
      id: owner.id,
      email: owner.email ?? "",
      name: typeof owner.user_metadata.full_name === "string" ? owner.user_metadata.full_name : "",
      createdAt: owner.created_at,
      lastSignInAt: owner.last_sign_in_at ?? null,
      bannedUntil: owner.banned_until ?? null,
      disabled: Boolean(owner.banned_until && new Date(owner.banned_until).getTime() > Date.now()),
    } : null,
    business: businessResult.data ? safeRecord(businessResult.data as Row) : null,
    members,
    workspaceData,
    online,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!isSameOrigin(request)) return jsonError("Invalid request origin.", 403);
  const { user: actor } = await requirePlatformAdmin();
  const { applicationId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return jsonError("Invalid application ID.", 400);

  let input: { action?: unknown; email?: unknown; confirmed?: unknown };
  try {
    input = await request.json() as typeof input;
  } catch {
    return jsonError("A valid JSON request body is required.", 400);
  }
  const action = String(input.action);
  if (!["delete_permanently", "send_password_reset", "change_email"].includes(action)) {
    return jsonError("Choose a supported business account action.", 400);
  }

  const admin = createAdminClient();
  const { data: application, error: applicationError } = await admin.from("business_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();
  if (applicationError) {
    console.error("Could not load business application for account action:", applicationError.message);
    return jsonError("Codsiga ganacsiga lama soo qaadi karin.", 500);
  }
  if (!application) return jsonError("Business application not found.", 404);
  if (application.deleted_at && action !== "delete_permanently") {
    return jsonError("Codsigan hore ayaa looga saaray liiska maamulka.", 404);
  }
  const ownerUserId = typeof application.owner_user_id === "string" ? application.owner_user_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(ownerUserId)) {
    return jsonError("Codsiga kuma xirna akoon milkiile oo sax ah; tirtirid buuxda lama xaqiijin karo.", 409);
  }

  const { data: platformAdmin, error: platformAdminError } = await admin.from("platform_admins")
    .select("user_id")
    .eq("user_id", ownerUserId)
    .maybeSingle();
  if (platformAdminError) {
    console.error("Could not verify the business owner is not a platform administrator:", platformAdminError.message);
    return jsonError("Akoonka milkiilaha lama xaqiijin karo.", 500);
  }
  if (platformAdmin) return jsonError("Super Admin account lagama maamuli karo Business applications.", 409);

  if (action === "delete_permanently") {
    const { data: target, error: targetError } = await admin.auth.admin.getUserById(ownerUserId);
    if (targetError && !isMissingAuthUser(targetError)) {
      console.error("Could not load business owner before permanent deletion:", targetError.message);
      return jsonError("Akoonka milkiilaha lama xaqiijin karo ka hor tirtiridda.", 503);
    }
    const owner = target?.user ?? null;

    if (owner) {
      const { error: banError } = await admin.auth.admin.updateUserById(ownerUserId, {
        ban_duration: "876000h",
        app_metadata: { ...owner.app_metadata, velto_business_access_disabled: true },
      });
      if (banError) {
        console.error("Could not block business owner before permanent deletion:", banError.message);
        return jsonError("Gelitaanka user-ka lama xiri karin ka hor tirtiridda.", 503);
      }
    }

    const { data: businesses, error: businessesError } = await admin.from("businesses")
      .select("id")
      .eq("owner_user_id", ownerUserId);
    if (businessesError) {
      console.error("Could not load business workspaces for permanent deletion:", businessesError.message);
      return jsonError("Ganacsiyada milkiilaha lama xaqiijin karo; waxba lama tirtirin.", 500);
    }
    const businessIds = (businesses ?? []).map((business) => String(business.id));

    const storageError = await removeBusinessStorage(admin, businessIds);
    if (storageError) {
      console.error("Could not remove business workspace files:", storageError);
      return jsonError("Sawirrada business-ka lama wada tirtirin; account-ka waa la xannibay, database-kana lama tirtirin. Sax Storage permissions-ka kadibna ku celi.", 503);
    }

    const { error: purgeError } = await admin.rpc("admin_purge_business_account_data", {
      target_user_id: ownerUserId,
    });
    if (purgeError) {
      console.error("Could not permanently remove business workspace data:", purgeError.message);
      if (purgeError.code === "PGRST202" || purgeError.code === "42883") {
        return jsonError("Ku socodsii supabase/migrations/20261117005000_business_hard_delete.sql ka hor tirtiridda joogtada ah.", 503);
      }
      return jsonError("Database-ku wuu diiday tirtiridda buuxda; Auth account-ka waa la xannibay, account-ka iyo codsiguna wali way jiraan. Hubi foreign-key constraints-ka.", 503);
    }

    const { error: referencePurgeError } = await admin.rpc("admin_purge_business_auth_references", {
      target_user_id: ownerUserId,
    });
    if (referencePurgeError) {
      console.error("Could not remove database references to the business owner:", referencePurgeError.message);
      if (referencePurgeError.code === "PGRST202" || referencePurgeError.code === "42883") {
        return jsonError("Ku socodsii supabase/migrations/20261118000000_business_auth_reference_cleanup.sql ka hor tirtiridda joogtada ah.", 503);
      }
      return jsonError("Xogta business-ka waa la nadiifiyey, laakiin tixraacyo database ayaa wali xannibaya Auth account-ka. Codsiga waa la hayey; hubi foreign-key constraints-ka kadibna ku celi.", 503);
    }

    const { error: applicationDeleteError } = await admin.from("business_applications")
      .delete()
      .eq("owner_user_id", ownerUserId);
    if (applicationDeleteError) {
      console.error("Business data was purged but its application could not be deleted:", applicationDeleteError.message);
      return jsonError("Xogta business-ka waa la tirtiray, laakiin codsiga lama tirtirin; Auth account-ka wali waa jiraa.", 503);
    }

    if (owner) {
      const { error: authDeleteError } = await admin.auth.admin.deleteUser(ownerUserId, false);
      if (authDeleteError && !isMissingAuthUser(authDeleteError)) {
        const { data: remainingTarget, error: verificationError } = await admin.auth.admin.getUserById(ownerUserId);
        if (verificationError && !isMissingAuthUser(verificationError)) {
          console.error("Could not verify the Auth account after deletion failed:", verificationError.message);
        }
        if (remainingTarget?.user || (verificationError && !isMissingAuthUser(verificationError))) {
          const { error: restoreError } = await admin.from("business_applications").insert(application);
          if (restoreError) {
            console.error("Could not restore the business application after Auth deletion failed:", restoreError.message);
            return jsonError("Auth account-ka wali waa jiraa, codsigana dib looma soo celin karin. La xiriir support-ka.", 503);
          }
          console.error("Auth account deletion failed:", authDeleteError.message);
          return jsonError("Auth account-ka wali waa jiraa; codsiga dib ayaa loo soo celiyey. Hubi foreign-key constraints-ka kadibna ku celi.", 503);
        }
      }
    }

    const email = owner?.email ?? application.email;
    const oldDeactivationMessage = `Gelitaanka ${email} waa la joojiyey; codsiga liiska waa laga qariyey, xogta business-kana waa la hayey.`;
    const { error: oldNotificationError } = await admin.from("platform_notifications")
      .delete()
      .eq("event_type", "business_user_deactivated")
      .eq("message", oldDeactivationMessage);
    if (oldNotificationError) {
      console.error("Business data was permanently deleted but an old account notification remains:", oldNotificationError.message);
    }

    const { error: auditError } = await admin.from("platform_audit_logs").insert({
      actor_id: actor.id,
      action: "delete_business_permanently",
      entity: "business_application",
      record_id: applicationId,
    });
    if (auditError) console.error("Business was permanently deleted but the Admin audit log failed:", auditError.message);
    return NextResponse.json({
      success: true,
      ...(oldNotificationError || auditError ? { warning: "Xogta business-ka waa la tirtiray, balse audit log ama notification hore lama nadiifin." } : {}),
    });
  }

  const { data: target, error: targetError } = await admin.auth.admin.getUserById(ownerUserId);
  if (targetError || !target.user) return jsonError("Akoonka milkiilaha lama heli karo.", 404);
  const owner = target.user;

  if (action === "send_password_reset") {
    const redirectTo = new URL("/auth/callback", request.nextUrl.origin);
    redirectTo.searchParams.set("next", "/business/set-password");
    redirectTo.searchParams.set("portal", "business");
    const businessAuth = await createClient("business");
    const { error } = await businessAuth.auth.resetPasswordForEmail(owner.email ?? application.email, {
      redirectTo: redirectTo.toString(),
    });
    if (error) {
      console.error("Could not send business owner password recovery email:", error.message);
      return jsonError("Link-ga dib-u-dejinta password-ka lama diri karin.", 503);
    }
    const { error: auditError } = await admin.from("platform_audit_logs").insert({
      actor_id: actor.id,
      action: "send_password_reset",
      entity: "business_user",
      record_id: owner.id,
    });
    if (auditError) console.error("Password reset email sent but the Admin audit log failed:", auditError.message);
    return NextResponse.json({
      success: true,
      ...(auditError ? { warning: "Link-ga waa la diray, balse audit log-ga lama qorin." } : {}),
    });
  }

  if (input.action === "change_email") {
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return jsonError("Geli email cusub oo sax ah.", 400);
    }
    if (input.confirmed !== true) {
      return jsonError("Xaqiiji in milkiiluhu codsaday isbeddelka oo uu xaq u leeyahay email-ka cusub.", 400);
    }
    const previousAuthEmail = owner.email ?? application.email;
    if (email === previousAuthEmail.toLowerCase()) return jsonError("Email-ka cusub wuxuu la mid yahay kii hore.", 409);
    const { data: previousBusiness, error: previousBusinessError } = await admin.from("businesses")
      .select("owner_email")
      .eq("owner_user_id", owner.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousBusinessError) {
      console.error("Could not verify the current business contact email:", previousBusinessError.message);
      return jsonError("Email-ka hadda jira ee business-ka lama xaqiijin karo.", 500);
    }

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(owner.id, {
      email,
      email_confirm: true,
    });
    if (authUpdateError) {
      console.error("Could not update the verified business owner email:", authUpdateError.message);
      return jsonError(`Email-ka lama beddeli karin: ${authUpdateError.message}`, 409);
    }

    const [applicationUpdate, businessUpdate] = await Promise.all([
      admin.from("business_applications").update({ email }).eq("owner_user_id", owner.id),
      admin.from("businesses").update({ owner_email: email }).eq("owner_user_id", owner.id),
    ]);
    const databaseError = applicationUpdate.error ?? businessUpdate.error;
    if (databaseError) {
      console.error("Auth email was changed but business contact details could not be updated:", databaseError.message);
      const [applicationRollback, businessRollback, authRollback] = await Promise.all([
        admin.from("business_applications").update({ email: application.email }).eq("owner_user_id", owner.id),
        admin.from("businesses").update({ owner_email: previousBusiness?.owner_email ?? previousAuthEmail }).eq("owner_user_id", owner.id),
        admin.auth.admin.updateUserById(owner.id, { email: previousAuthEmail, email_confirm: true }),
      ]);
      if (applicationRollback.error || businessRollback.error || authRollback.error) {
        console.error("Business owner email change rollback failed:", {
          application: applicationRollback.error?.message,
          business: businessRollback.error?.message,
          auth: authRollback.error?.message,
        });
        return jsonError("Email-ka qayb ahaan ayuu isu beddelay; Super Admin ha hubiyo xogta Auth iyo business-ka.", 503);
      }
      return jsonError("Xogta xiriirka lama cusboonaysiin; email-kii hore ayaa dib loo celiyey.", 503);
    }

    const { error: auditError } = await admin.from("platform_audit_logs").insert({
      actor_id: actor.id,
      action: "change_email",
      entity: "business_user",
      record_id: owner.id,
    });
    if (auditError) console.error("Business owner email changed but the Admin audit log failed:", auditError.message);
    return NextResponse.json({
      success: true,
      email,
      ...(auditError ? { warning: "Email-ka waa la beddelay, balse audit log-ga lama qorin." } : {}),
    });
  }

  return jsonError("Unsupported business account action.", 400);
}
