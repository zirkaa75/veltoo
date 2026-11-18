import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  AuditEntry,
  Business,
  BusinessApplication,
  BusinessCategory,
  PlatformNotification,
  PlatformPayment,
  PlatformSettings,
  PlatformUser,
  Subscription,
  SubscriptionPlan,
  SupportTicket,
} from "./super-admin-types";

type Row = Record<string, unknown>;

export type SuperAdminSnapshot = {
  users: PlatformUser[];
  applications: BusinessApplication[];
  archivedApplications: BusinessApplication[];
  businesses: Business[];
  categories: BusinessCategory[];
  plans: SubscriptionPlan[];
  subscriptions: Subscription[];
  payments: PlatformPayment[];
  tickets: SupportTicket[];
  notifications: PlatformNotification[];
  auditLogs: AuditEntry[];
  settings: PlatformSettings;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function identifier(value: unknown, fallback: string) {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function appStatus(value: unknown): BusinessApplication["status"] {
  const statuses: Record<string, BusinessApplication["status"]> = {
    pending: "Pending",
    under_review: "Under Review",
    approved: "Approved",
    rejected: "Rejected",
  };
  return statuses[text(value)] ?? "Pending";
}

function businessStatus(value: unknown): Business["status"] {
  const statuses: Record<string, Business["status"]> = {
    active: "Active",
    suspended: "Suspended",
    archived: "Archived",
  };
  return statuses[text(value)] ?? "Active";
}

function platformPaymentStatus(value: unknown): PlatformPayment["status"] {
  const statuses: Record<string, PlatformPayment["status"]> = {
    pending: "Pending",
    verified: "Verified",
    failed: "Failed",
    refunded: "Refunded",
  };
  return statuses[text(value)] ?? "Pending";
}

function subscriptionStatus(value: unknown): Subscription["status"] {
  const statuses: Record<string, Subscription["status"]> = {
    trial: "Trial",
    active: "Active",
    past_due: "Past due",
    cancelled: "Cancelled",
    expired: "Expired",
    suspended: "Suspended",
  };
  return statuses[text(value)] ?? "Trial";
}

export async function loadSuperAdminSnapshot(): Promise<{ data?: SuperAdminSnapshot; error?: string }> {
  const supabase = await createClient("admin");
  const [
    businessesResult,
    plansResult,
    subscriptionsResult,
    adminResult,
    applicationResult,
    archivedApplicationResult,
    categoryResult,
    paymentResult,
    ticketResult,
    notificationResult,
    auditResult,
    settingsResult,
  ] = await Promise.all([
    supabase.from("businesses").select("id, name, owner_name, owner_email, category, status, phone, branch_count, registered_at").order("registered_at", { ascending: false }),
    supabase.from("subscription_plans").select("id, name, description, price, currency, interval, trial_days, max_users, max_branches, modules, status").order("created_at", { ascending: false }),
    supabase.from("subscriptions").select("id, business_id, plan_id, status, starts_at, renews_at").order("created_at", { ascending: false }),
    supabase.from("platform_admins").select("user_id, role, display_name, email, created_at").eq("status", "active"),
    supabase.from("business_applications").select("id, owner_user_id, business_name, owner_name, email, phone, category, status, rejection_reason, created_at").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("business_applications").select("id, owner_user_id, business_name, owner_name, email, phone, category, status, rejection_reason, created_at, deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(100),
    supabase.from("business_categories").select("id, name, description, modules, status").order("name"),
    supabase.from("platform_payments").select("id, business_id, transaction_reference, provider, amount, currency, status, paid_at").order("created_at", { ascending: false }),
    supabase.from("platform_support_tickets").select("id, business_id, requester_email, subject, category, priority, status, created_at").order("created_at", { ascending: false }),
    supabase.from("platform_notifications").select("id, title, message, read_at, created_at").order("created_at", { ascending: false }),
    supabase.from("platform_audit_logs").select("id, action, entity, record_id, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("platform_settings").select("platform_name, support_email, default_currency, timezone, registration_open, maintenance_mode").eq("id", true).maybeSingle(),
  ]);

  const failed = [
    adminResult,
    applicationResult,
    archivedApplicationResult,
    businessesResult,
    categoryResult,
    paymentResult,
    plansResult,
    subscriptionsResult,
    ticketResult,
    notificationResult,
    auditResult,
    settingsResult,
  ].find((result) => result.error);

  if (failed?.error) {
    return { error: `Supabase platform data could not be loaded: ${failed.error.message}` };
  }

  const planNames = new Map((plansResult.data ?? []).map((plan) => [plan.id, plan.name]));
  const currentSubscriptions = new Map(
    (subscriptionsResult.data ?? [])
      .filter((subscription) => ["trial", "active", "past_due"].includes(subscription.status))
      .map((subscription) => [subscription.business_id, planNames.get(subscription.plan_id) ?? ""]),
  );
  const businessesRaw = (businessesResult.data ?? []) as Row[];
  const businessesById = new Map(businessesRaw.map((business) => [text(business.id), business]));

  const users: PlatformUser[] = ((adminResult.data ?? []) as Row[]).map((admin) => {
    return {
      id: text(admin.user_id),
      name: text(admin.display_name, "Platform user"),
      email: text(admin.email),
      role: text(admin.role) === "support_staff" ? "Support Staff" : "Platform Administrator",
      createdAt: text(admin.created_at),
    };
  });

  return {
    data: {
      users,
      applications: ((applicationResult.data ?? []) as Row[]).map((row) => ({
        id: text(row.id),
        ownerUserId: text(row.owner_user_id),
        businessName: text(row.business_name),
        ownerName: text(row.owner_name),
        email: text(row.email),
        phone: text(row.phone),
        category: text(row.category),
        status: appStatus(row.status),
        submittedAt: text(row.created_at),
        rejectionReason: text(row.rejection_reason),
      })),
      archivedApplications: ((archivedApplicationResult.data ?? []) as Row[]).map((row) => ({
        id: text(row.id),
        ownerUserId: text(row.owner_user_id),
        businessName: text(row.business_name),
        ownerName: text(row.owner_name),
        email: text(row.email),
        phone: text(row.phone),
        category: text(row.category),
        status: appStatus(row.status),
        submittedAt: text(row.created_at),
        rejectionReason: text(row.rejection_reason),
        archivedAt: text(row.deleted_at),
      })),
      businesses: businessesRaw.map((row) => {
        const id = text(row.id);
        return {
          id,
          name: text(row.name),
          owner: text(row.owner_name, "Business owner"),
          email: text(row.owner_email),
          phone: text(row.phone),
          category: text(row.category),
          status: businessStatus(row.status),
          plan: currentSubscriptions.get(id) ?? "",
          branches: numeric(row.branch_count),
          registeredAt: text(row.registered_at),
        };
      }),
      categories: ((categoryResult.data ?? []) as Row[]).map((row) => ({
        id: text(row.id),
        name: text(row.name),
        description: text(row.description),
        modules: Array.isArray(row.modules) ? row.modules.map(String) : [],
        status: text(row.status) === "archived" ? "Archived" : "Active",
      })),
      plans: ((plansResult.data ?? []) as Row[]).map((row) => ({
        id: text(row.id),
        name: text(row.name),
        description: text(row.description),
        price: numeric(row.price),
        currency: text(row.currency, "USD"),
        interval: text(row.interval) === "yearly" ? "Yearly" : "Monthly",
        trialDays: numeric(row.trial_days),
        maxUsers: numeric(row.max_users, 1),
        maxBranches: numeric(row.max_branches, 1),
        modules: Array.isArray(row.modules) ? row.modules.map(String) : [],
        status: text(row.status) === "archived" ? "Archived" : "Active",
      })),
      subscriptions: ((subscriptionsResult.data ?? []) as Row[]).map((row) => ({
        id: text(row.id),
        businessId: text(row.business_id),
        planId: text(row.plan_id),
        status: subscriptionStatus(row.status),
        startedAt: text(row.starts_at),
        renewsAt: text(row.renews_at),
      })),
      payments: ((paymentResult.data ?? []) as Row[]).map((row) => ({
        id: text(row.id),
        businessId: text(row.business_id),
        reference: text(row.transaction_reference),
        provider: text(row.provider),
        amount: numeric(row.amount),
        currency: text(row.currency, "USD"),
        paidAt: text(row.paid_at),
        status: platformPaymentStatus(row.status),
      })),
      tickets: ((ticketResult.data ?? []) as Row[]).map((row) => ({
        id: text(row.id),
        business: text(businessesById.get(text(row.business_id))?.name, "Business"),
        requester: text(row.requester_email, "Requester"),
        subject: text(row.subject),
        category: text(row.category),
        priority: (text(row.priority) || "normal") as SupportTicket["priority"],
        status: (text(row.status).replace("_", " ") || "open") as SupportTicket["status"],
        createdAt: text(row.created_at),
      })),
      notifications: ((notificationResult.data ?? []) as Row[]).map((row) => ({
        id: text(row.id),
        title: text(row.title),
        message: text(row.message),
        createdAt: text(row.created_at),
        read: Boolean(row.read_at),
      })),
      auditLogs: ((auditResult.data ?? []) as Row[]).map((row, index) => ({
        id: identifier(row.id, `audit-${index}`),
        action: text(row.action),
        entity: text(row.entity),
        record: text(row.record_id),
        createdAt: text(row.created_at),
      })),
      settings: {
        platformName: text(settingsResult.data?.platform_name, "VELTO"),
        supportEmail: text(settingsResult.data?.support_email),
        defaultCurrency: text(settingsResult.data?.default_currency, "USD"),
        timezone: text(settingsResult.data?.timezone, "Africa/Mogadishu"),
        registrationOpen: settingsResult.data?.registration_open ?? true,
        maintenanceMode: settingsResult.data?.maintenance_mode ?? false,
      } satisfies PlatformSettings,
    },
  };
}
