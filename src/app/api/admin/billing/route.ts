import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 20_000;

type JsonRecord = Record<string, unknown>;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function writeAudit(
  admin: ReturnType<typeof createAdminClient>,
  actorId: string,
  action: string,
  entity: string,
  recordId: string,
) {
  const { error } = await admin.from("platform_audit_logs").insert({
    actor_id: actorId,
    action,
    entity,
    record_id: recordId,
  });
  if (!error) return undefined;
  console.error("Billing operation completed, but its audit log failed:", error.message);
  return "Ficilka waa la kaydiyey, laakiin audit log-ga lama qorin.";
}

async function success(
  admin: ReturnType<typeof createAdminClient>,
  actorId: string,
  action: string,
  entity: string,
  recordId: string,
  message: string,
  status = 200,
) {
  const warning = await writeAudit(admin, actorId, action, entity, recordId);
  return NextResponse.json(
    { success: true, id: recordId, message, ...(warning ? { warning } : {}) },
    { status },
  );
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Invalid request origin.", 403);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return jsonError("Supabase is not configured on the server.", 503);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return jsonError("Request body is too large.", 413);

  let input: JsonRecord;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonError("Request body is too large.", 413);
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonError("A valid JSON request body is required.", 400);
    }
    input = parsed as JsonRecord;
  } catch {
    return jsonError("A valid JSON request body is required.", 400);
  }

  const supabase = await createClient("admin");
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Authentication required.", 401);

  const { data: membership, error: membershipError } = await supabase
    .from("platform_admins")
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    console.error("Could not verify billing administrator access:", membershipError.message);
    return jsonError("Could not verify administrator access.", 500);
  }
  if (!membership || membership.status !== "active" || membership.role !== "platform_administrator") {
    return jsonError("Platform administrator access only.", 403);
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("Billing service client is unavailable:", error);
    return jsonError("Billing database access is not configured.", 503);
  }

  const action = stringValue(input.action);

  if (action === "save_plan") {
    const planId = stringValue(input.planId);
    const name = stringValue(input.name);
    const description = stringValue(input.description);
    const currency = stringValue(input.currency).toUpperCase();
    const interval = stringValue(input.interval).toLowerCase();
    const price = numberValue(input.price);
    const trialDays = numberValue(input.trialDays);
    const maxUsers = numberValue(input.maxUsers);
    const maxBranches = numberValue(input.maxBranches);
    const modules = Array.isArray(input.modules)
      ? input.modules.map(stringValue).filter(Boolean)
      : [];

    if ((planId && !UUID_PATTERN.test(planId)) || !name || name.length > 120) {
      return jsonError("A valid plan name and ID are required.", 400);
    }
    if (description.length > 1000 || !/^[A-Z]{3}$/.test(currency)) {
      return jsonError("Enter a valid currency and a description under 1000 characters.", 400);
    }
    if (price === null || price < 0 || price > 1_000_000_000) {
      return jsonError("Plan price must be between 0 and 1,000,000,000.", 400);
    }
    if (!["monthly", "yearly"].includes(interval)) {
      return jsonError("Billing interval must be monthly or yearly.", 400);
    }
    if (trialDays === null || !Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) {
      return jsonError("Trial duration must be between 0 and 365 days.", 400);
    }
    if (maxUsers === null || !Number.isInteger(maxUsers) || maxUsers < 1 || maxUsers > 100_000
      || maxBranches === null || !Number.isInteger(maxBranches) || maxBranches < 1 || maxBranches > 100_000) {
      return jsonError("User and branch limits must be positive whole numbers.", 400);
    }
    if (modules.length > 50 || modules.some((module) => module.length > 80)) {
      return jsonError("Plan modules contain invalid values.", 400);
    }

    const payload = {
      name,
      description,
      price,
      currency,
      interval,
      trial_days: trialDays,
      max_users: maxUsers,
      max_branches: maxBranches,
      modules,
    };

    if (planId) {
      const { data, error } = await admin.from("subscription_plans")
        .update(payload).eq("id", planId).select("id").maybeSingle();
      if (error) {
        console.error("Could not update subscription plan:", error.message);
        return jsonError("Could not update the subscription plan.", 500);
      }
      if (!data) return jsonError("Subscription plan not found.", 404);
      return success(admin, user.id, "update", "subscription_plan", planId, "Plan-ka waa la cusboonaysiiyey.");
    }

    const { data, error } = await admin.from("subscription_plans")
      .insert({ ...payload, status: "active" }).select("id").single();
    if (error || !data) {
      console.error("Could not create subscription plan:", error?.message);
      return jsonError("Could not create the subscription plan.", 500);
    }
    return success(admin, user.id, "create", "subscription_plan", data.id, "Plan cusub ayaa la sameeyey.", 201);
  }

  if (action === "plan_status") {
    const planId = stringValue(input.planId);
    const status = stringValue(input.status).toLowerCase();
    if (!UUID_PATTERN.test(planId) || !["active", "archived"].includes(status)) {
      return jsonError("A valid plan and status are required.", 400);
    }
    const { data, error } = await admin.from("subscription_plans")
      .update({ status }).eq("id", planId).select("id").maybeSingle();
    if (error) {
      console.error("Could not update subscription plan status:", error.message);
      return jsonError("Could not update the plan status.", 500);
    }
    if (!data) return jsonError("Subscription plan not found.", 404);
    return success(admin, user.id, "status_change", "subscription_plan", planId, `Plan-ka waxaa loo beddelay ${status}.`);
  }

  if (action === "assign_subscription") {
    const businessId = stringValue(input.businessId);
    const planId = stringValue(input.planId);
    const renewalDate = validDate(stringValue(input.renewsAt));
    if (!UUID_PATTERN.test(businessId) || !UUID_PATTERN.test(planId) || !renewalDate) {
      return jsonError("Choose a business, an active plan, and a valid renewal date.", 400);
    }
    const renewalDateValue = new Date(renewalDate);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (renewalDateValue.getTime() < todayStart.getTime()) {
      return jsonError("Renewal date must be today or in the future.", 400);
    }

    const [businessResult, planResult, existingResult] = await Promise.all([
      admin.from("businesses").select("id, status").eq("id", businessId).maybeSingle(),
      admin.from("subscription_plans").select("id, status").eq("id", planId).maybeSingle(),
      admin.from("subscriptions").select("id")
        .eq("business_id", businessId).in("status", ["active", "trial", "past_due"]).limit(1),
    ]);

    const queryError = businessResult.error || planResult.error || existingResult.error;
    if (queryError) {
      console.error("Could not validate subscription assignment:", queryError.message);
      return jsonError("Could not validate the business and plan.", 500);
    }
    if (!businessResult.data || businessResult.data.status !== "active") {
      return jsonError("Only active businesses can receive a subscription.", 409);
    }
    if (!planResult.data || planResult.data.status !== "active") {
      return jsonError("Choose an active subscription plan.", 409);
    }
    if (existingResult.data?.length) {
      return jsonError("This business already has a subscription that has not ended.", 409);
    }

    const { data, error } = await admin.from("subscriptions").insert({
      business_id: businessId,
      plan_id: planId,
      status: "active",
      starts_at: new Date().toISOString(),
      renews_at: renewalDate,
    }).select("id").single();
    if (error || !data) {
      console.error("Could not assign subscription plan:", error?.message);
      return jsonError("Could not assign the subscription plan.", 500);
    }
    return success(admin, user.id, "assign", "subscription", data.id, "Subscription-ka waa la qoondeeyey.", 201);
  }

  if (action === "subscription_status") {
    const subscriptionId = stringValue(input.subscriptionId);
    const status = stringValue(input.status).toLowerCase().replaceAll(" ", "_");
    const statuses = ["trial", "active", "past_due", "cancelled", "expired", "suspended"];
    if (!UUID_PATTERN.test(subscriptionId) || !statuses.includes(status)) {
      return jsonError("A valid subscription and status are required.", 400);
    }
    const { data, error } = await admin.from("subscriptions")
      .update({ status }).eq("id", subscriptionId).select("id").maybeSingle();
    if (error) {
      console.error("Could not update subscription status:", error.message);
      return jsonError("Could not update the subscription status.", 500);
    }
    if (!data) return jsonError("Subscription not found.", 404);
    return success(admin, user.id, "status_change", "subscription", subscriptionId, `Subscription-ka waxaa loo beddelay ${status}.`);
  }

  if (action === "record_payment") {
    const businessId = stringValue(input.businessId);
    const reference = stringValue(input.reference);
    const provider = stringValue(input.provider);
    const currency = stringValue(input.currency).toUpperCase();
    const amount = numberValue(input.amount);
    const paidAt = validDate(stringValue(input.paidAt));

    if (!UUID_PATTERN.test(businessId) || !reference || reference.length > 160) {
      return jsonError("A valid business and transaction reference are required.", 400);
    }
    if (!provider || provider.length > 80 || !/^[A-Z]{3}$/.test(currency)) {
      return jsonError("Enter a payment provider and valid ISO currency.", 400);
    }
    if (amount === null || amount <= 0 || amount > 1_000_000_000 || !paidAt) {
      return jsonError("Enter a valid positive payment amount and date.", 400);
    }

    const { data: business, error: businessError } = await admin.from("businesses")
      .select("id").eq("id", businessId).maybeSingle();
    if (businessError) {
      console.error("Could not verify payment business:", businessError.message);
      return jsonError("Could not verify the business.", 500);
    }
    if (!business) return jsonError("Business not found.", 404);

    const { data: duplicate, error: duplicateError } = await admin.from("platform_payments")
      .select("id").eq("provider", provider).eq("transaction_reference", reference).maybeSingle();
    if (duplicateError) {
      console.error("Could not check duplicate payment reference:", duplicateError.message);
      return jsonError("Could not verify the transaction reference.", 500);
    }
    if (duplicate) return jsonError("This provider transaction reference is already recorded.", 409);

    const { data, error } = await admin.from("platform_payments").insert({
      business_id: businessId,
      transaction_reference: reference,
      provider,
      amount,
      currency,
      paid_at: paidAt,
      status: "pending",
    }).select("id").single();
    if (error || !data) {
      console.error("Could not record platform payment:", error?.message);
      return jsonError("Could not record the payment.", 500);
    }
    return success(admin, user.id, "record", "platform_payment", data.id, "Payment-ka waa la diiwaangeliyey, wuxuuna sugayaa xaqiijin.", 201);
  }

  if (action === "payment_status") {
    const paymentId = stringValue(input.paymentId);
    const status = stringValue(input.status).toLowerCase();
    if (!UUID_PATTERN.test(paymentId) || !["pending", "verified", "failed", "refunded"].includes(status)) {
      return jsonError("A valid payment and status are required.", 400);
    }

    const payload: { status: string; verified_by: string | null; verified_at: string | null } = {
      status,
      verified_by: null,
      verified_at: null,
    };
    if (status === "verified") {
      payload.verified_by = user.id;
      payload.verified_at = new Date().toISOString();
    }
    const { data, error } = await admin.from("platform_payments")
      .update(payload).eq("id", paymentId).select("id").maybeSingle();
    if (error) {
      console.error("Could not update platform payment status:", error.message);
      return jsonError("Could not update the payment status.", 500);
    }
    if (!data) return jsonError("Payment not found.", 404);
    return success(admin, user.id, "status_change", "platform_payment", paymentId, `Payment-ka waxaa loo beddelay ${status}.`);
  }

  return jsonError("Unsupported billing operation.", 400);
}
