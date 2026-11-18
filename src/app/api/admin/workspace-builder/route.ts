import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_BODY_BYTES = 16_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODULES = ["dashboard", "products", "sales", "invoices", "customers", "suppliers", "branches", "team", "reports", "settings"];
const WIDGETS = ["products", "out_of_stock", "customers", "branches", "recent_sales"];

type JsonRecord = Record<string, unknown>;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function parseConfig(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const config = value as JsonRecord;
  const theme = config.theme;
  if (!theme || typeof theme !== "object" || Array.isArray(theme)) return null;
  const colors = theme as JsonRecord;
  const colorPattern = /^#[0-9a-f]{6}$/i;
  if (
    typeof colors.primaryColor !== "string" || !colorPattern.test(colors.primaryColor)
    || typeof colors.accentColor !== "string" || !colorPattern.test(colors.accentColor)
    || typeof colors.backgroundColor !== "string" || !colorPattern.test(colors.backgroundColor)
    || !["standard", "compact"].includes(String(config.layout))
    || !["classic", "soft"].includes(String(config.sidebar))
    || !Array.isArray(config.dashboardWidgets)
    || !Array.isArray(config.hiddenModules)
    || config.dashboardWidgets.length > WIDGETS.length
    || config.hiddenModules.length > MODULES.length
    || config.dashboardWidgets.some((item) => typeof item !== "string" || !WIDGETS.includes(item))
    || config.hiddenModules.some((item) => typeof item !== "string" || !MODULES.includes(item))
  ) {
    return null;
  }

  return {
    theme: {
      primaryColor: colors.primaryColor,
      accentColor: colors.accentColor,
      backgroundColor: colors.backgroundColor,
    },
    layout: config.layout,
    sidebar: config.sidebar,
    dashboardWidgets: config.dashboardWidgets,
    hiddenModules: config.hiddenModules,
  };
}

async function getAdministrator() {
  const supabase = await createClient("admin");
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: errorResponse("Authentication required.", 401) };

  const { data: membership, error: membershipError } = await supabase
    .from("platform_admins")
    .select("role,status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) {
    console.error("Could not verify workspace-builder administrator:", membershipError.message);
    return { error: errorResponse("Could not verify administrator access.", 500) };
  }
  if (!membership || membership.status !== "active" || membership.role !== "platform_administrator") {
    return { error: errorResponse("Platform administrator access only.", 403) };
  }

  try {
    return { user, admin: createAdminClient() };
  } catch (error) {
    console.error("Workspace-builder service client is unavailable:", error);
    return { error: errorResponse("Workspace-builder database access is not configured.", 503) };
  }
}

async function writeAudit(
  admin: ReturnType<typeof createAdminClient>,
  actorId: string,
  action: string,
  recordId: string,
) {
  const { error } = await admin.from("platform_audit_logs").insert({
    actor_id: actorId,
    action,
    entity: "workspace_configuration",
    record_id: recordId,
  });
  if (!error) return undefined;
  console.error("Workspace-builder action completed, but its audit log failed:", error.message);
  return "Ficilka waa la dhammeeyey, laakiin audit log-ga lama qorin.";
}

export async function GET() {
  const auth = await getAdministrator();
  if ("error" in auth) return auth.error;

  const [plansResult, subscriptionsResult, versionsResult] = await Promise.all([
    auth.admin.from("subscription_plans")
      .select("id,name,description,price,currency,interval,trial_days,max_users,max_branches,modules,status,workspace_tier,workspace_config,published_workspace_config,workspace_config_version")
      .order("created_at", { ascending: false }),
    auth.admin.from("subscriptions")
      .select("id,business_id,plan_id,status,renews_at,businesses!inner(name)")
      .in("status", ["active", "trial"])
      .order("created_at", { ascending: false }),
    auth.admin.from("workspace_versions")
      .select("id,plan_id,tier,version,config,created_by,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const failed = plansResult.error ?? subscriptionsResult.error ?? versionsResult.error;
  if (failed) {
    console.error("Could not load workspace-builder data:", failed.message);
    return errorResponse("Could not load workspace-builder data. Apply its database migration and try again.", 503);
  }

  return NextResponse.json({
    plans: plansResult.data ?? [],
    assignments: subscriptionsResult.data ?? [],
    versions: versionsResult.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const auth = await getAdministrator();
  if ("error" in auth) return auth.error;

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return errorResponse("Request body is too large.", 413);

  let input: JsonRecord;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return errorResponse("Request body is too large.", 413);
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return errorResponse("A valid JSON request body is required.", 400);
    }
    input = parsed as JsonRecord;
  } catch {
    return errorResponse("A valid JSON request body is required.", 400);
  }

  const action = typeof input.action === "string" ? input.action : "";
  if (action === "restore") {
    const versionId = typeof input.versionId === "string" ? input.versionId : "";
    if (!UUID_PATTERN.test(versionId)) return errorResponse("A valid workspace version is required.", 400);
    const { data, error } = await auth.admin.rpc("restore_workspace_version", {
      target_version_id: versionId,
      target_actor_id: auth.user.id,
    });
    if (error) {
      console.error("Could not restore workspace version:", error.message);
      if (error.code === "23505") {
        return errorResponse("This restore would assign a star tier already owned by another active plan.", 409);
      }
      return errorResponse("Could not restore the selected workspace version.", 500);
    }
    const warning = await writeAudit(auth.admin, auth.user.id, "restore_workspace_configuration", versionId);
    return NextResponse.json({ success: true, version: data, ...(warning ? { warning } : {}) });
  }

  const planId = typeof input.planId === "string" ? input.planId : "";
  const tier = input.tier;
  const config = parseConfig(input.config);
  if (!UUID_PATTERN.test(planId) || (tier !== "4-star" && tier !== "5-star") || !config) {
    return errorResponse("Choose a valid active plan, star tier, and workspace configuration.", 400);
  }

  const { data: plan, error: planError } = await auth.admin.from("subscription_plans")
    .select("id,status")
    .eq("id", planId)
    .maybeSingle();
  if (planError) {
    console.error("Could not verify workspace-builder plan:", planError.message);
    return errorResponse("Could not verify the selected plan.", 500);
  }
  if (!plan || plan.status !== "active") return errorResponse("Only active plans can be configured or published.", 409);

  if (action === "draft") {
    const { data: updatedPlan, error } = await auth.admin.from("subscription_plans")
      .update({ workspace_tier: tier, workspace_config: config, updated_at: new Date().toISOString() })
      .eq("id", planId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("Could not save workspace draft:", error.message);
      return errorResponse("Could not save the workspace draft.", 500);
    }
    if (!updatedPlan) return errorResponse("Only active plans can be configured or published.", 409);
    const warning = await writeAudit(auth.admin, auth.user.id, "save_workspace_draft", planId);
    return NextResponse.json({ success: true, ...(warning ? { warning } : {}) });
  }

  if (action === "publish") {
    const { data, error } = await auth.admin.rpc("publish_workspace_configuration", {
      target_plan_id: planId,
      target_tier: tier,
      target_config: config,
      target_actor_id: auth.user.id,
    });
    if (error) {
      console.error("Could not publish workspace configuration:", error.message);
      if (error.code === "23505") {
        return errorResponse("Another active plan already owns this published star tier.", 409);
      }
      return errorResponse("Could not publish the workspace configuration.", 500);
    }
    const warning = await writeAudit(auth.admin, auth.user.id, "publish_workspace_configuration", planId);
    return NextResponse.json({ success: true, version: data, ...(warning ? { warning } : {}) });
  }

  return errorResponse("Unsupported workspace-builder operation.", 400);
}
