"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { FormEvent, ReactNode } from "react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";
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
import type { SuperAdminSnapshot } from "./load-snapshot";
import WorkspaceBuilderView from "./workspace-builder";
import BusinessApplicationReview from "./business-application-review";
import AdminPushControls from "./admin-push-controls";

const EMPTY_SNAPSHOT: SuperAdminSnapshot = {
  users: [],
  applications: [],
  archivedApplications: [],
  businesses: [],
  categories: [],
  plans: [],
  subscriptions: [],
  payments: [],
  tickets: [],
  notifications: [],
  auditLogs: [],
  settings: {
    platformName: "VELTO",
    supportEmail: "",
    defaultCurrency: "USD",
    timezone: "Africa/Mogadishu",
    registrationOpen: true,
    maintenanceMode: false,
  },
};

function createClient() {
  return createSupabaseClient("admin");
}

const navigation = [
  { id: "overview", label: "Guudmar", group: "PLATFORM" },
  { id: "applications", label: "Business applications", group: "BUSINESS" },
  { id: "businesses", label: "Business directory", group: "BUSINESS" },
  { id: "categories", label: "Business categories", group: "BUSINESS" },
  { id: "workspace-builder", label: "Star Workspace Builder", group: "BUSINESS" },
  { id: "plans", label: "Subscription plans", group: "BILLING" },
  { id: "subscriptions", label: "Subscriptions", group: "BILLING" },
  { id: "payments", label: "Platform payments", group: "BILLING" },
  { id: "revenue", label: "Revenue analytics", group: "BILLING" },
  { id: "users", label: "Platform users", group: "MANAGEMENT" },
  { id: "support", label: "Support tickets", group: "MANAGEMENT" },
  { id: "whatsapp-support", label: "WhatsApp Support Center", group: "MANAGEMENT" },
  { id: "notifications", label: "Notifications", group: "MANAGEMENT" },
  { id: "audit", label: "Audit logs", group: "MANAGEMENT" },
  { id: "settings", label: "Platform settings", group: "MANAGEMENT" },
] as const;

export type SectionId = (typeof navigation)[number]["id"];
type BusinessFormStatus = Business["status"];
type ApplicationFormStatus = BusinessApplication["status"];
type TicketStatus = SupportTicket["status"];
type ToastMessage = { message: string; tone: "success" | "error" };

const dateMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type CurrentDate = { input: string; label: string };
const emptyCurrentDate: CurrentDate = { input: "", label: "" };
const somaliWeekdays = ["AXAD", "ISNIIN", "TALAADO", "ARBACO", "KHAMIIS", "JIMCO", "SABTI"];
const somaliMonths = [
  "JANAAYO",
  "FEBRAAYO",
  "MAARSO",
  "ABRIIL",
  "MAAYO",
  "JUUN",
  "JULAY",
  "OGAAS",
  "SEBTEMBAR",
  "OKTOOBAR",
  "NOOFEEMBAR",
  "DISEEMBAR",
];
let currentDateSnapshot: CurrentDate | null = null;

function subscribeToCurrentDate() {
  return () => {};
}

function getCurrentDateSnapshot(): CurrentDate {
  if (!currentDateSnapshot) {
    const now = new Date();
    const weekday = somaliWeekdays[now.getUTCDay()];
    const month = somaliMonths[now.getUTCMonth()];
    currentDateSnapshot = {
      input: now.toISOString().slice(0, 10),
      label: `${weekday}, ${month} ${now.getUTCDate()}, ${now.getUTCFullYear()}`,
    };
  }
  return currentDateSnapshot;
}

function useCurrentDate() {
  return useSyncExternalStore(subscribeToCurrentDate, getCurrentDateSnapshot, () => emptyCurrentDate);
}

const businessStatuses: BusinessFormStatus[] = ["Active", "Suspended", "Archived"];
const moduleOptions = [
  "Dashboard",
  "Products",
  "Inventory",
  "Sales",
  "Invoices",
  "Customers",
  "Suppliers",
  "Purchases",
  "Finance",
  "Employees",
  "Branches",
  "Reports",
];

const defaultBusinessCategories = [
  { name: "Clothing & Fashion", description: "Ganacsiyada dharka iyo moodada.", modules: ["Products", "Inventory", "Sales", "Customers", "Reports"] },
  { name: "Grocery & Retail", description: "Dukaamada tafaariiqda iyo raashinka.", modules: ["Products", "Inventory", "Sales", "Customers", "Reports"] },
  { name: "Electronics", description: "Ganacsiyada qalabka elektarooniga ah.", modules: ["Products", "Inventory", "Sales", "Customers", "Reports"] },
  { name: "Restaurant & Café", description: "Makhaayadaha, kafateeriyada iyo adeegga cuntada.", modules: ["Products", "Inventory", "Sales", "Customers", "Finance", "Reports"] },
  { name: "Salon & Beauty", description: "Adeegyada quruxda iyo daryeelka.", modules: ["Sales", "Customers", "Employees", "Finance", "Reports"] },
  { name: "Wholesale & Distribution", description: "Jumladleyda iyo qaybiyeyaasha alaabta.", modules: ["Products", "Inventory", "Sales", "Customers", "Suppliers", "Purchases", "Reports"] },
  { name: "Service Business", description: "Ganacsiyada bixiya adeegyo.", modules: ["Sales", "Invoices", "Customers", "Finance", "Reports"] },
  { name: "Other", description: "Ganacsiyada aan ku jirin qaybaha kale.", modules: ["Dashboard", "Sales", "Customers", "Reports"] },
];

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${dateMonths[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function formatDateTime(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(value)} ${hours}:${minutes} UTC`;
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function splitModules(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const contents = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function statusTone(value: string) {
  const status = value.toLowerCase();
  if (["active", "approved", "verified", "resolved", "read"].includes(status)) return "good";
  if (["pending", "under review", "trial", "in progress", "open"].includes(status)) return "warning";
  if (["suspended", "rejected", "failed", "urgent", "past due"].includes(status)) return "danger";
  if (["archived", "cancelled", "expired", "closed", "refunded"].includes(status)) return "muted";
  return "neutral";
}

export default function AdminDashboardPage({
  initialData,
  adminName = "Super Admin",
  initialSection = "overview",
}: {
  initialData?: SuperAdminSnapshot;
  adminName?: string;
  initialSection?: SectionId;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const routeSection = navigation.find((item) => item.id === pathname?.split("/")[2])?.id;
  const section = routeSection ?? initialSection;
  const currentDate = useCurrentDate();
  const [snapshot, setSnapshot] = useState<SuperAdminSnapshot | null>(initialData ?? null);
  const [snapshotLoading, setSnapshotLoading] = useState(!initialData && initialSection !== "workspace-builder");
  const [snapshotError, setSnapshotError] = useState("");
  const [snapshotRetry, setSnapshotRetry] = useState(0);
  const { users, applications, archivedApplications, businesses, categories, plans, subscriptions, payments, tickets, notifications, auditLogs, settings } = snapshot ?? EMPTY_SNAPSHOT;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BusinessCategory | null>(null);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<BusinessApplication | null>(null);
  const [businessPresence, setBusinessPresence] = useState<Record<string, { online: boolean; lastSeenAt: string }>>({});
  const [presenceError, setPresenceError] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [formError, setFormError] = useState("");
  const [exportingApplications, setExportingApplications] = useState(false);
  const [seedingCategories, setSeedingCategories] = useState(false);
  const [deletingApplicationId, setDeletingApplicationId] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) return;
    if (section === "workspace-builder") return;

    const controller = new AbortController();
    fetch("/api/admin/dashboard", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json() as { data?: SuperAdminSnapshot; error?: string };
        if (!response.ok || !result.data) {
          throw new Error(result.error ?? "Xogta dashboard-ka lama soo rari karin.");
        }
        setSnapshotError("");
        setSnapshot(result.data);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSnapshotError(error instanceof Error ? error.message : "Xogta dashboard-ka lama soo rari karin.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setSnapshotLoading(false);
      });

    return () => controller.abort();
  }, [initialData, section, snapshotRetry]);

  useEffect(() => {
    if (section !== "applications") return;
    const refreshTimer = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(refreshTimer);
  }, [router, section]);

  useEffect(() => {
    if (section !== "applications") return;
    let active = true;
    async function refreshPresence() {
      try {
        const response = await fetch("/api/admin/business-activity", { cache: "no-store" });
        const result = await response.json() as {
          presence?: Record<string, { online: boolean; lastSeenAt: string }>;
          error?: string;
        };
        if (!response.ok) throw new Error(result.error ?? "Xaaladda users-ka lama soo qaadi karin.");
        if (active) {
          setBusinessPresence(result.presence ?? {});
          setPresenceError("");
        }
      } catch (error) {
        if (active) setPresenceError(error instanceof Error ? error.message : "Xaaladda users-ka lama soo qaadi karin.");
      }
    }
    void refreshPresence();
    const timer = window.setInterval(() => void refreshPresence(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [section]);

  const visibleNavigation = navigation.filter((item) => !["plans", "subscriptions", "payments", "revenue"].includes(item.id));
  const sectionInfo = navigation.find((item) => item.id === section) ?? navigation[0];
  const pendingApplications = applications.filter((item) => item.status === "Pending").length;
  const unreadNotifications = notifications.filter((item) => !item.read).length;
  const activeSubscriptions = subscriptions.filter((item) => item.status === "Active").length;
  const expiredSubscriptions = subscriptions.filter((item) => item.status === "Expired").length;
  const suspendedBusinesses = businesses.filter((item) => item.status === "Suspended").length;
  const verifiedPayments = payments.filter((item) => item.status === "Verified");
  const revenueByCurrency = verifiedPayments.reduce<Record<string, number>>((totals, payment) => {
    totals[payment.currency] = (totals[payment.currency] ?? 0) + payment.amount;
    return totals;
  }, {});
  const currentMonth = currentDate.input.slice(0, 7);
  const monthlyVerifiedPayments = currentMonth
    ? verifiedPayments.filter((payment) => payment.paidAt.slice(0, 7) === currentMonth)
    : [];
  const monthlyRevenueByCurrency = monthlyVerifiedPayments.reduce<Record<string, number>>((totals, payment) => {
    totals[payment.currency] = (totals[payment.currency] ?? 0) + payment.amount;
    return totals;
  }, {});
  const newRegistrations = currentMonth
    ? businesses.filter((business) => business.registeredAt.slice(0, 7) === currentMonth).length
    : 0;

  const filteredApplications = useMemo(
    () => filterRows(applications, query, statusFilter, (item) => `${item.businessName} ${item.ownerName} ${item.email} ${item.category}`, (item) => item.status),
    [applications, query, statusFilter],
  );
  const filteredBusinesses = useMemo(
    () => filterRows(businesses, query, statusFilter, (item) => `${item.name} ${item.owner} ${item.email} ${item.category} ${item.plan}`, (item) => item.status),
    [businesses, query, statusFilter],
  );
  const filteredUsers = useMemo(
    () => users.filter((item) => `${item.name} ${item.email} ${item.role}`.toLowerCase().includes(query.trim().toLowerCase())),
    [users, query],
  );
  const filteredCategories = useMemo(
    () => filterRows(categories, query, statusFilter, (item) => `${item.name} ${item.description} ${item.modules.join(" ")}`, (item) => item.status),
    [categories, query, statusFilter],
  );
  const filteredPlans = useMemo(
    () => filterRows(plans, query, statusFilter, (item) => `${item.name} ${item.description} ${item.currency}`, (item) => item.status),
    [plans, query, statusFilter],
  );
  const filteredSubscriptions = useMemo(
    () => filterRows(subscriptions, query, statusFilter, (item) => `${businessName(item.businessId, businesses)} ${planName(item.planId, plans)}`, (item) => item.status),
    [subscriptions, query, statusFilter, businesses, plans],
  );
  const filteredPayments = useMemo(
    () => filterRows(payments, query, statusFilter, (item) => `${businessName(item.businessId, businesses)} ${item.reference} ${item.provider}`, (item) => item.status),
    [payments, query, statusFilter, businesses],
  );
  const filteredTickets = useMemo(
    () => filterRows(tickets, query, statusFilter, (item) => `${item.business} ${item.requester} ${item.subject} ${item.category}`, (item) => item.status),
    [tickets, query, statusFilter],
  );
  const filteredAuditLogs = useMemo(
    () => auditLogs.filter((item) => `${item.action} ${item.entity} ${item.record}`.toLowerCase().includes(query.trim().toLowerCase())),
    [auditLogs, query],
  );

  function notify(message: string, tone: ToastMessage["tone"] = "success") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3200);
  }

  function openSection(next: SectionId) {
    const nextPath = next === "overview" ? "/admin/dashboard" : `/admin/${next}`;
    if (window.location.pathname !== nextPath) router.push(nextPath, { scroll: false });
    if (!snapshot) setSnapshotLoading(true);
    setQuery("");
    setStatusFilter("All statuses");
    setShowForm(false);
    setEditingCategory(null);
    setEditingPlan(null);
    setFormError("");
    setToast(null);
  }

  function retrySnapshot() {
    setSnapshotLoading(true);
    setSnapshotRetry((attempt) => attempt + 1);
  }

  function openCreateForm() {
    setFormError("");
    setEditingCategory(null);
    setEditingPlan(null);
    setShowForm(true);
  }

  async function createOrUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const formData = new FormData(event.currentTarget);
    const value = (key: string) => String(formData.get(key) ?? "").trim();
    const supabase = createClient();

    try {
    if (section === "categories") {
      const name = value("name");
      const duplicate = categories.some((item) => item.name.toLowerCase() === name.toLowerCase() && item.id !== editingCategory?.id);
      if (duplicate) {
        setFormError("Magaca category-gaas hore ayuu u jiraa.");
        return;
      }
      const payload = {
        name,
        description: value("description"),
        modules: splitModules(formData.get("modules")),
        status: (editingCategory?.status ?? "Active").toLowerCase(),
      };
      const { error } = editingCategory
        ? await supabase.from("business_categories").update(payload).eq("id", editingCategory.id)
        : await supabase.from("business_categories").insert(payload);
      if (!finishMutation(error, editingCategory ? "Category-ga waa la cusboonaysiiyey." : "Category cusub ayaa la sameeyey.")) return;
    } else if (section === "plans") {
      const saved = await finishBillingMutation("save_plan", {
        planId: editingPlan?.id,
        name: value("name"),
        description: value("description"),
        price: value("price"),
        currency: value("currency"),
        interval: value("interval"),
        trialDays: value("trialDays"),
        maxUsers: value("maxUsers"),
        maxBranches: value("maxBranches"),
        modules: splitModules(formData.get("modules")),
      }, editingPlan ? "Plan-ka waa la cusboonaysiiyey." : "Plan cusub ayaa la sameeyey.");
      if (!saved) return;
    } else if (section === "subscriptions") {
      const saved = await finishBillingMutation("assign_subscription", {
        businessId: value("businessId"),
        planId: value("planId"),
        renewsAt: value("renewsAt"),
      }, "Subscription-ka waa la qoondeeyey.");
      if (!saved) return;
    } else if (section === "payments") {
      const saved = await finishBillingMutation("record_payment", {
        businessId: value("businessId"),
        amount: value("amount"),
        currency: value("currency"),
        provider: value("provider"),
        reference: value("reference"),
        paidAt: value("paidAt"),
      }, "Payment-ka waa la diiwaangeliyey, wuxuuna sugayaa xaqiijin.");
      if (!saved) return;
    } else if (section === "notifications") {
      const { error } = await supabase.from("platform_notifications").insert({
        title: value("title"),
        message: value("message"),
        event_type: "platform_announcement",
      });
      if (!finishMutation(error, "Platform notification waa la sameeyey.")) return;
    } else {
      setFormError("Ficilkan waxaa lagu maamulaa habraaca rasmiga ah, mana aha in browser-ka laga abuuro.");
      return;
    }

    setShowForm(false);
    setEditingCategory(null);
    setEditingPlan(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kaydinta lama dhamaystirin.";
      setFormError(`Kaydintu way fashilantay: ${message}`);
      notify(`Kaydintu way fashilantay: ${message}`, "error");
    }
  }

  function finishMutation(error: { message: string } | null, message: string) {
    if (error) {
      const errorMessage = `Kaydintu way fashilantay: ${error.message}`;
      setFormError(errorMessage);
      notify(errorMessage, "error");
      return false;
    }
    notify(message);
    window.setTimeout(() => window.location.reload(), 500);
    return true;
  }

  async function finishBillingMutation(action: string, payload: Record<string, unknown>, message: string) {
    try {
      const response = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json() as { error?: string; warning?: string };
      if (!response.ok) throw new Error(result.error ?? "Billing operation failed.");
      const notice = result.warning ? `${message} ${result.warning}` : message;
      notify(notice, result.warning ? "error" : "success");
      window.setTimeout(() => window.location.reload(), 500);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Billing operation failed.";
      setFormError(errorMessage);
      notify(errorMessage, "error");
      return false;
    }
  }

  async function reviewApplication(application: BusinessApplication, status: ApplicationFormStatus) {
    let rejectionReason = "";
    if (status === "Rejected") {
      const reason = window.prompt("Geli sababta codsiga loo diiday:");
      if (reason === null) return;
      if (!reason.trim()) {
        notify("Sababta diidmada waa khasab.");
        return;
      }
      rejectionReason = reason.trim();
    }
    try {
      const response = await fetch("/api/admin/business-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: application.id,
          status,
          rejectionReason,
        }),
      });
      const result = await response.json() as { error?: string; warning?: string };
      if (!response.ok) throw new Error(result.error ?? "Codsiga lama cusboonaysiin.");
      const message = status === "Approved"
        ? "Codsiga waa la ansixiyey; milkiiluhu si toos ah ayuu ugu geli karaa workspace-ka."
        : status === "Rejected"
          ? "Codsiga waa la diiday, sababtana waa la kaydiyey."
          : "Codsiga waxaa loo wareejiyey Under Review.";
      setSnapshot((current) => current ? {
        ...current,
        applications: current.applications.map((item) => item.id === application.id
          ? { ...item, status, rejectionReason: status === "Rejected" ? rejectionReason : "" }
          : item),
      } : current);
      notify(result.warning ? `${message} ${result.warning}` : message, result.warning ? "error" : "success");
      router.refresh();
    } catch (reviewError) {
      const message = reviewError instanceof Error ? reviewError.message : "Codsiga lama cusboonaysiin.";
      setFormError(message);
      notify(message, "error");
    }
  }

  async function deleteBusinessPermanently(application: BusinessApplication) {
    if (!window.confirm(`TIRTIRID JOOGTO AH: Ma tirtiraysaa ${application.businessName}, account-ka ${application.email}, dhammaan xogta workspace-ka, transactions-ka iyo sawirrada? Tallaabadan dib looma soo celin karo.`)) return;
    setDeletingApplicationId(application.id);
    try {
      const response = await fetch(`/api/admin/business-applications/${encodeURIComponent(application.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_permanently" }),
      });
      const result = await response.json() as { error?: string; warning?: string };
      if (!response.ok) throw new Error(result.error ?? "Xogta user-ka lama tirtirin.");
      setSnapshot((current) => current ? {
        ...current,
        applications: current.applications.filter((item) => item.id !== application.id),
        archivedApplications: current.archivedApplications.filter((item) => item.id !== application.id),
      } : current);
      notify(
        result.warning ?? "Account-ka, codsiga iyo xogta business-ka si joogto ah ayaa database-ka looga tirtiray.",
        result.warning ? "error" : "success",
      );
      router.refresh();
    } catch (deactivationError) {
      const message = deactivationError instanceof Error ? deactivationError.message : "Xogta user-ka lama tirtirin.";
      notify(message, "error");
    } finally {
      setDeletingApplicationId(null);
    }
  }

  async function changeBusinessStatus(business: Business, status: BusinessFormStatus) {
    const { error } = await createClient().from("businesses")
      .update({ status: status.toLowerCase() }).eq("id", business.id);
    if (error) {
      notify(`Xaaladda lama beddelin: ${error.message}`);
      return;
    }
    notify(`${business.name}: xaaladda waxaa loo beddelay ${status}.`);
    setSelectedBusiness(null);
    window.setTimeout(() => window.location.reload(), 500);
  }

  async function changeSubscription(subscription: Subscription, status: Subscription["status"]) {
    await finishBillingMutation(
      "subscription_status",
      { subscriptionId: subscription.id, status },
      `Subscription-ka waxaa loo beddelay ${status}.`,
    );
  }

  async function changePayment(payment: PlatformPayment, status: PlatformPayment["status"]) {
    await finishBillingMutation(
      "payment_status",
      { paymentId: payment.id, status },
      `Payment-ka ${payment.reference} waxaa loo beddelay ${status}.`,
    );
  }

  async function changeTicketStatus(ticket: SupportTicket, status: TicketStatus) {
    const { error } = await createClient().from("platform_support_tickets")
      .update({ status: status.toLowerCase().replace(" ", "_") }).eq("id", ticket.id);
    finishMutation(error, `${ticket.id} waxaa loo beddelay ${status}.`);
  }

  async function toggleCategory(category: BusinessCategory) {
    const status = category.status === "Active" ? "Archived" : "Active";
    const { error } = await createClient().from("business_categories")
      .update({ status: status.toLowerCase() }).eq("id", category.id);
    finishMutation(error, `${category.name} waxaa loo beddelay ${status}.`);
  }

  async function seedDefaultCategories() {
    if (seedingCategories || categories.length) return;
    setSeedingCategories(true);
    try {
      const { error } = await createClient().from("business_categories").insert(
        defaultBusinessCategories.map((category) => ({
          ...category,
          status: "active",
        })),
      );
      finishMutation(error, "Qaybaha ganacsiga ee bilowga ah waa la sameeyey.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Qaybaha lama samayn.";
      notify(`Qaybaha bilowga lama samayn: ${message}`, "error");
    } finally {
      setSeedingCategories(false);
    }
  }

  async function togglePlan(plan: SubscriptionPlan) {
    const status = plan.status === "Active" ? "Archived" : "Active";
    await finishBillingMutation(
      "plan_status",
      { planId: plan.id, status },
      `${plan.name} waxaa loo beddelay ${status}.`,
    );
  }

  async function toggleNotification(notification: PlatformNotification) {
    const { error } = await createClient().from("platform_notifications")
      .update({ read_at: notification.read ? null : new Date().toISOString() }).eq("id", notification.id);
    finishMutation(error, "Xaaladda notification-ka waa la kaydiyey.");
  }

  async function markAllNotificationsRead() {
    const { error } = await createClient().from("platform_notifications")
      .update({ read_at: new Date().toISOString() }).is("read_at", null);
    finishMutation(error, "Dhammaan notifications-ka waa la calaamadeeyey.");
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const currency = String(data.get("defaultCurrency") ?? "").trim().toUpperCase();
    const supportEmail = String(data.get("supportEmail") ?? "").trim();
    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      setFormError("Default currency-gu waa inuu noqdaa ISO 4217, tusaale USD ama SOS.");
      return;
    }
    if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
      setFormError("Geli email support sax ah.");
      return;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      setFormError("Default currency-gu waa inuu noqdaa ISO 4217, tusaale USD ama SOS.");
      return;
    }
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setFormError("Aqoonsiga maamulka lama xaqiijin; settings lama kaydin.");
      return;
    }
    const { error } = await supabase.from("platform_settings").update({
      platform_name: String(data.get("platformName") ?? "").trim(),
      support_email: supportEmail,
      default_currency: currency,
      timezone: String(data.get("timezone") ?? "").trim(),
      registration_open: data.get("registrationOpen") === "on",
      maintenance_mode: data.get("maintenanceMode") === "on",
      updated_by: user.id,
    }).eq("id", true);
    setFormError("");
    finishMutation(error, "Settings-ka waa la cusboonaysiiyey.");
  }

  async function logout() {
    try {
      const { error } = await createClient().auth.signOut();
      if (error) {
        notify(`Ka bixitaanku ma guulaysan: ${error.message}`);
        return;
      }
      router.replace("/admin/login");
    } catch (error) {
      notify(error instanceof Error ? `Ka bixitaanku ma guulaysan: ${error.message}` : "Ka bixitaanku ma guulaysan.");
    }
  }

  function exportRows() {
    if (section === "businesses") {
      downloadCsv("velto-businesses.csv", [
        ["Business ID", "Business", "Owner", "Email", "Category", "Status", "Plan", "Branches", "Registered"],
        ...filteredBusinesses.map((item) => [item.id, item.name, item.owner, item.email, item.category, item.status, item.plan, item.branches, item.registeredAt]),
      ]);
    } else if (section === "payments") {
      downloadCsv("velto-platform-payments.csv", [
        ["Payment ID", "Business", "Provider", "Reference", "Amount", "Currency", "Status", "Date"],
        ...filteredPayments.map((item) => [item.id, businessName(item.businessId, businesses), item.provider, item.reference, item.amount, item.currency, item.status, item.paidAt]),
      ]);
    } else if (section === "audit") {
      downloadCsv("velto-audit-logs.csv", [
        ["Action", "Entity", "Record", "Date"],
        ...filteredAuditLogs.map((item) => [item.action, item.entity, item.record, item.createdAt]),
      ]);
    }
  }

  async function exportApplicationsWord() {
    if (exportingApplications) return;
    setExportingApplications(true);
    try {
      const {
        BorderStyle,
        Document,
        PageOrientation,
        Packer,
        Paragraph,
        Table,
        TableCell,
        TableRow,
        TextRun,
        WidthType,
      } = await import("docx");
      const border = { style: BorderStyle.SINGLE, size: 4, color: "D9E1E9" };
      const cell = (text: string, header = false) => new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text,
                bold: header,
                color: header ? "FFFFFF" : "26374A",
                font: "Arial",
                size: header ? 18 : 17,
              }),
            ],
          }),
        ],
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        shading: header ? { fill: "214B79" } : undefined,
      });
      const rows = [
        new TableRow({
          tableHeader: true,
          children: [
            "BUSINESS / CATEGORY",
            "APPLICANT",
            "CONTACT",
            "STATUS",
            "DATE",
          ].map((heading) => cell(heading, true)),
        }),
        ...filteredApplications.map((item) => new TableRow({
          cantSplit: true,
          children: [
            `${item.businessName} — ${item.category}`,
            item.ownerName,
            `${item.email} · ${item.phone || "—"}`,
            item.status,
            formatDate(item.submittedAt),
          ].map((value) => cell(value)),
        })),
      ];
      const document = new Document({
        sections: [{
          properties: {
            page: { size: { orientation: PageOrientation.LANDSCAPE } },
          },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Business applications",
                  bold: true,
                  color: "17324D",
                  font: "Arial",
                  size: 34,
                }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `VELTO · ${filteredApplications.length} codsi`,
                  color: "657589",
                  font: "Arial",
                  size: 20,
                }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Filter: ${statusFilter}${query.trim() ? ` · Raadinta: ${query.trim()}` : ""}`,
                  color: "657589",
                  font: "Arial",
                  size: 18,
                }),
              ],
            }),
            new Table({
              rows,
              width: { size: 100, type: WidthType.PERCENTAGE },
              columnWidths: [2600, 1700, 3400, 1200, 1600],
              borders: {
                top: border,
                bottom: border,
                left: border,
                right: border,
                insideHorizontal: border,
                insideVertical: border,
              },
            }),
          ],
        }],
      });
      const blob = await Packer.toBlob(document);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = "velto-business-applications.docx";
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Codsiyada ganacsiyada Word ahaan ayaa loo soo dejiyey.");
    } catch (error) {
      notify(
        error instanceof Error
          ? `Word-ka lama soo dejin karin: ${error.message}`
          : "Word-ka lama soo dejin karin.",
        "error",
      );
    } finally {
      setExportingApplications(false);
    }
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="brand sidebar-brand" href="/">
          <span className="brand-mark">V</span><span>VELTO</span>
        </Link>
        <nav className="admin-nav admin-nav-complete" aria-label="Super Admin navigation">
          {visibleNavigation.map((item, index) => (
            <div className="admin-nav-entry" key={item.id}>
              {(index === 0 || visibleNavigation[index - 1].group !== item.group) && (
                <div className="sidebar-caption">{item.group}</div>
              )}
              <button
                aria-current={section === item.id ? "page" : undefined}
                className={`nav-item ${section === item.id ? "nav-item-active" : ""}`}
                onClick={() => openSection(item.id)}
                type="button"
              >
                <span className="nav-glyph" aria-hidden="true">{sectionGlyph(item.id)}</span>
                <span>{item.label}</span>
                {item.id === "applications" && pendingApplications > 0 && <span className="nav-count">{pendingApplications}</span>}
                {item.id === "notifications" && unreadNotifications > 0 && <span className="nav-count">{unreadNotifications}</span>}
                {item.id === "users" && <span className="nav-count">{users.length}</span>}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-admin-avatar">{initials(adminName).slice(0, 1) || "A"}</div>
          <div className="sidebar-admin-info"><strong>{adminName}</strong><span>Super Admin</span></div>
          <button className="logout-icon" onClick={logout} title="Ka bax" type="button" aria-label="Ka bax">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></svg>
          </button>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div className="breadcrumbs"><span>VELTO</span><i>/</i><strong>{sectionInfo.label}</strong></div>
          <div className="topbar-actions">
            <span className="environment-badge"><i /> SUPER ADMIN · PRIVATE</span>
            <button className="topbar-avatar" onClick={logout} type="button" aria-label="Ka bax" title="Ka bax">{initials(adminName).slice(0, 1) || "A"}</button>
          </div>
        </header>

        <div className="admin-content admin-content-complete">
          {snapshotLoading && section !== "workspace-builder" && (
            <section className="admin-snapshot-state" aria-live="polite" role="status">
              <span className="admin-snapshot-spinner" aria-hidden="true" />
              <h1>Dashboard-kaaga waa diyaar.</h1>
              <p>Xogta saxda ah ee platform-ka ayaa la soo rarayaa.</p>
              <div className="admin-snapshot-skeletons" aria-hidden="true">
                <span /><span /><span /><span />
              </div>
            </section>
          )}
          {snapshotError && !snapshotLoading && section !== "workspace-builder" && (
            <section className="admin-snapshot-state" role="alert">
              <h1>Xogta dashboard-ka lama soo rari karin.</h1>
              <p>{snapshotError}</p>
              <button className="button button-dark" onClick={retrySnapshot} type="button">Mar kale isku day</button>
            </section>
          )}
          {section === "workspace-builder" && <WorkspaceBuilderView />}
          {snapshot && !snapshotLoading && !snapshotError && <>
          {section === "overview" && (
            <Overview
              adminName={adminName}
              activeBusinesses={businesses.filter((item) => item.status === "Active").length}
              activeSubscriptions={activeSubscriptions}
              applications={applications}
              auditLogs={auditLogs}
              businesses={businesses}
              onNavigate={openSection}
              payments={verifiedPayments}
              pendingApplications={pendingApplications}
              revenueByCurrency={revenueByCurrency}
              monthlyRevenueByCurrency={monthlyRevenueByCurrency}
              monthlyPaymentCount={monthlyVerifiedPayments.length}
              suspendedBusinesses={suspendedBusinesses}
              expiredSubscriptions={expiredSubscriptions}
              newRegistrations={newRegistrations}
              dateLabel={currentDate.label}
              users={users}
            />
          )}
          {section === "applications" && (
            <ApplicationsView
              applications={filteredApplications}
              archivedApplications={archivedApplications}
              businessPresence={businessPresence}
              onOpenDetails={setSelectedApplication}
              onExport={exportApplicationsWord}
              exporting={exportingApplications}
              onRefresh={() => router.refresh()}
              onReview={reviewApplication}
              onDeletePermanently={deleteBusinessPermanently}
              deletingApplicationId={deletingApplicationId}
              presenceError={presenceError}
              query={query}
              setQuery={setQuery}
              setStatusFilter={setStatusFilter}
              statusFilter={statusFilter}
            />
          )}
          {section === "businesses" && (
            <BusinessesView
              businesses={filteredBusinesses}
              onExport={exportRows}
              onSelect={setSelectedBusiness}
              onStatus={changeBusinessStatus}
              query={query}
              setQuery={setQuery}
              setStatusFilter={setStatusFilter}
              statusFilter={statusFilter}
            />
          )}
          {section === "categories" && (
            <CategoriesView
              categories={filteredCategories}
              canSeedDefaults={categories.length === 0}
              seedingDefaults={seedingCategories}
              onCreate={openCreateForm}
              onEdit={(item) => { setEditingCategory(item); setShowForm(true); setFormError(""); }}
              onSeedDefaults={seedDefaultCategories}
              onToggle={toggleCategory}
              query={query}
              setQuery={setQuery}
              setStatusFilter={setStatusFilter}
              statusFilter={statusFilter}
              showForm={showForm}
              editingCategory={editingCategory}
              formError={formError}
              onSubmit={createOrUpdate}
              onCancel={() => { setShowForm(false); setEditingCategory(null); }}
            />
          )}
          {section === "plans" && (
            <PlansView
              plans={filteredPlans}
              onCreate={openCreateForm}
              onEdit={(item) => { setEditingPlan(item); setShowForm(true); setFormError(""); }}
              onToggle={togglePlan}
              query={query}
              setQuery={setQuery}
              setStatusFilter={setStatusFilter}
              statusFilter={statusFilter}
              showForm={showForm}
              editingPlan={editingPlan}
              formError={formError}
              onSubmit={createOrUpdate}
              onCancel={() => { setShowForm(false); setEditingPlan(null); }}
            />
          )}
          {section === "subscriptions" && (
            <SubscriptionsView
              subscriptions={filteredSubscriptions}
              businesses={businesses.filter((item) => item.status !== "Archived")}
              plans={plans.filter((item) => item.status === "Active")}
              onCreate={openCreateForm}
              onStatus={changeSubscription}
              query={query}
              setQuery={setQuery}
              setStatusFilter={setStatusFilter}
              statusFilter={statusFilter}
              showForm={showForm}
              formError={formError}
              onSubmit={createOrUpdate}
              onCancel={() => setShowForm(false)}
            />
          )}
          {section === "payments" && (
            <PaymentsView
              payments={filteredPayments}
              businesses={businesses.filter((item) => item.status !== "Archived")}
              onCreate={openCreateForm}
              onExport={exportRows}
              onStatus={changePayment}
              query={query}
              setQuery={setQuery}
              setStatusFilter={setStatusFilter}
              statusFilter={statusFilter}
              showForm={showForm}
              formError={formError}
              onSubmit={createOrUpdate}
              onCancel={() => setShowForm(false)}
            />
          )}
          {section === "revenue" && (
            <RevenueView payments={verifiedPayments} revenueByCurrency={revenueByCurrency} />
          )}
          {section === "users" && (
            <UsersView
              users={filteredUsers}
              query={query}
              setQuery={setQuery}
            />
          )}
          {section === "support" && (
            <SupportView
              tickets={filteredTickets}
              onStatus={changeTicketStatus}
              query={query}
              setQuery={setQuery}
              setStatusFilter={setStatusFilter}
              statusFilter={statusFilter}
            />
          )}
          {section === "notifications" && (
            <NotificationsView
              notifications={notifications}
              onCreate={openCreateForm}
              onToggle={toggleNotification}
              onReadAll={markAllNotificationsRead}
              showForm={showForm}
              formError={formError}
              onSubmit={createOrUpdate}
              onCancel={() => setShowForm(false)}
            />
          )}
          {section === "audit" && (
            <AuditView
              entries={filteredAuditLogs}
              onExport={exportRows}
              query={query}
              setQuery={setQuery}
            />
          )}
          {section === "settings" && (
            <SettingsView
              settings={settings}
              onSave={saveSettings}
              error={formError}
            />
          )}
          <div className="admin-disclaimer"><span>i</span> Super Admin waxa uu arkaa oo keliya heerka iyo xogta maamul ee platform-ka; xogta hawlgalka business-ka si gooni ah ayaa loo ilaaliyaa.</div>
          </>}
        </div>
        <footer className="admin-footer"><span>VELTO Super Admin</span><span>© 2026 VELTO</span></footer>
      </section>

      {selectedBusiness && (
        <BusinessDetails
          business={selectedBusiness}
          onClose={() => setSelectedBusiness(null)}
          onStatus={changeBusinessStatus}
          subscription={subscriptions.find((item) => item.businessId === selectedBusiness.id)}
          plan={plans.find((item) => item.id === subscriptions.find((sub) => sub.businessId === selectedBusiness.id)?.planId)}
        />
      )}
      {selectedApplication && (
        <BusinessApplicationReview
          application={selectedApplication}
          onClose={() => setSelectedApplication(null)}
          onNotify={notify}
          onReview={reviewApplication}
          onDeleted={() => {
            setSelectedApplication(null);
            setSnapshot((current) => current ? {
              ...current,
              applications: current.applications.filter((item) => item.id !== selectedApplication.id),
              archivedApplications: current.archivedApplications.filter((item) => item.id !== selectedApplication.id),
            } : current);
            router.refresh();
          }}
        />
      )}
      {toast && <div className={`admin-toast admin-toast-${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}><span>{toast.tone === "error" ? "!" : "✓"}</span>{toast.message}</div>}
    </main>
  );

  function businessName(id: string, list: Business[]) {
    return list.find((item) => item.id === id)?.name ?? "Ganacsi aan la aqoon";
  }
}

function filterRows<T>(
  rows: T[],
  query: string,
  statusFilter: string,
  searchable: (row: T) => string,
  status: (row: T) => string,
) {
  const normalized = query.trim().toLowerCase();
  return rows.filter((row) =>
    (!normalized || searchable(row).toLowerCase().includes(normalized))
    && (statusFilter === "All statuses" || status(row) === statusFilter),
  );
}

function businessName(id: string, businesses: Business[]) {
  return businesses.find((item) => item.id === id)?.name ?? "Ganacsi aan la aqoon";
}

function planName(id: string, plans: SubscriptionPlan[]) {
  return plans.find((item) => item.id === id)?.name ?? "Plan aan la aqoon";
}

function sectionGlyph(section: SectionId) {
  const glyphs: Record<SectionId, string> = {
    overview: "▦",
    applications: "▤",
    businesses: "⌂",
    categories: "◫",
    "workspace-builder": "✦",
    plans: "◇",
    subscriptions: "↻",
    payments: "◎",
    revenue: "↗",
    users: "♙",
    support: "◌",
    "whatsapp-support": "☏",
    notifications: "♧",
    audit: "≡",
    settings: "⚙",
  };
  return glyphs[section];
}

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`admin-status status-${statusTone(value)}`}><i />{value}</span>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="admin-empty">
      <span className="empty-icon">⌂</span>
      <strong>{title}</strong>
      <span>{description}</span>
      {action}
    </div>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel complete-panel ${className}`}>{children}</section>;
}

function PanelHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="panel-heading complete-panel-heading">
      <div><h2>{title}</h2><p>{description}</p></div>
      {children}
    </div>
  );
}

function Toolbar({
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  statuses,
  onExport,
  exportLabel,
  exporting,
  extraAction,
}: {
  query: string;
  setQuery: (value: string) => void;
  statusFilter?: string;
  setStatusFilter?: (value: string) => void;
  statuses?: string[];
  onExport?: () => void | Promise<void>;
  exportLabel?: string;
  exporting?: boolean;
  extraAction?: ReactNode;
}) {
  return (
    <div className="admin-toolbar">
      <label className="search-box">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
        <input aria-label="Raadi" onChange={(event) => setQuery(event.target.value)} placeholder="Raadi..." value={query} />
      </label>
      {statuses && setStatusFilter && (
        <select aria-label="Filter by status" className="toolbar-select" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
          <option>All statuses</option>
          {statuses.map((status) => <option key={status}>{status}</option>)}
        </select>
      )}
      {onExport && <button className="button button-outline button-small" disabled={exporting} onClick={onExport} type="button">{exporting ? "Word waa la diyaarinayaa..." : `Soo dejiso ${exportLabel ?? "CSV"}`} <span>↓</span></button>}
      {extraAction}
    </div>
  );
}

function ModalForm({
  title,
  description,
  onSubmit,
  onCancel,
  error,
  children,
}: {
  title: string;
  description: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  error: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section aria-labelledby="modal-title" aria-modal="true" className="admin-modal" role="dialog">
        <div className="admin-modal-heading">
          <div><h2 id="modal-title">{title}</h2><p>{description}</p></div>
          <button className="close-form" onClick={onCancel} type="button" aria-label="Xir">×</button>
        </div>
        <form className="admin-form" onSubmit={onSubmit}>
          {children}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="admin-form-actions">
            <button className="button button-outline button-small" onClick={onCancel} type="button">Jooji</button>
            <button className="button button-dark button-small" type="submit">Kaydi <span>→</span></button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  name,
  required = false,
  type = "text",
  defaultValue,
  placeholder,
  min,
  step,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  defaultValue?: string | number;
  placeholder?: string;
  min?: number;
  step?: string;
  children?: ReactNode;
}) {
  return (
    <label className="admin-field">
      <span>{label}{required && <i> *</i>}</span>
      {children ?? (
        <input
          defaultValue={defaultValue}
          min={min}
          name={name}
          placeholder={placeholder}
          required={required}
          step={step}
          type={type}
        />
      )}
    </label>
  );
}

function CurrentDateField({
  label,
  name,
  required = false,
}: {
  label: string;
  name: string;
  required?: boolean;
}) {
  const { input } = useCurrentDate();
  return <Field key={input} defaultValue={input} label={label} name={name} required={required} type="date" />;
}

function Overview({
  adminName,
  activeBusinesses,
  activeSubscriptions,
  applications,
  auditLogs,
  businesses,
  onNavigate,
  payments,
  pendingApplications,
  revenueByCurrency,
  monthlyRevenueByCurrency,
  monthlyPaymentCount,
  suspendedBusinesses,
  expiredSubscriptions,
  newRegistrations,
  dateLabel,
  users,
}: {
  adminName: string;
  activeBusinesses: number;
  activeSubscriptions: number;
  applications: BusinessApplication[];
  auditLogs: AuditEntry[];
  businesses: Business[];
  onNavigate: (section: SectionId) => void;
  payments: PlatformPayment[];
  pendingApplications: number;
  revenueByCurrency: Record<string, number>;
  monthlyRevenueByCurrency: Record<string, number>;
  monthlyPaymentCount: number;
  suspendedBusinesses: number;
  expiredSubscriptions: number;
  newRegistrations: number;
  dateLabel: string;
  users: PlatformUser[];
}) {
  return (
    <>
      <PageHeading
        eyebrow={dateLabel || "VELTO PLATFORM"}
        title={`Ku soo dhowow, ${adminName}`}
        description="Maamul ganacsiyada, rukhsadaha iyo adeegyada VELTO."
        action={<button className="button button-dark" onClick={() => onNavigate("applications")} type="button">Codsiyada eeg <span>→</span></button>}
      />
      <div className="stat-grid">
        <MetricCard label="TOTAL BUSINESSES" value={businesses.length} detail="Dhammaan ganacsiyada" icon="⌂" onClick={() => onNavigate("businesses")} />
        <MetricCard label="ACTIVE BUSINESSES" value={activeBusinesses} detail="Ganacsiyada shaqaynaya" icon="✓" onClick={() => onNavigate("businesses")} />
        <MetricCard label="PENDING APPLICATIONS" value={pendingApplications} detail="Sugaya dib-u-eegis" icon="▤" accent onClick={() => onNavigate("applications")} />
        <MetricCard label="SUSPENDED BUSINESSES" value={suspendedBusinesses} detail="Hakadka ku jira" icon="Ⅱ" onClick={() => onNavigate("businesses")} />
        <MetricCard label="ACTIVE SUBSCRIPTIONS" value={activeSubscriptions} detail="Subscription shaqaynaya" icon="↻" onClick={() => onNavigate("subscriptions")} />
        <MetricCard label="EXPIRED SUBSCRIPTIONS" value={expiredSubscriptions} detail="U baahan dib-u-cusboonaysiin" icon="⌛" onClick={() => onNavigate("subscriptions")} />
        <MetricCard label="NEW REGISTRATIONS" value={newRegistrations} detail="Ganacsiyada bishan la diiwaangeliyey" icon="+" onClick={() => onNavigate("businesses")} />
        <MetricCard label="PLATFORM USERS" value={users.length} detail="Kooxda maamulka platform-ka" icon="♙" onClick={() => onNavigate("users")} />
      </div>
      <div className="admin-overview-grid">
        <Panel>
          <PanelHeader title="Business applications" description="Codsiyadii ugu dambeeyey iyo xaaladdooda.">
            <button className="button button-outline button-small" onClick={() => onNavigate("applications")} type="button">Dhammaan eeg →</button>
          </PanelHeader>
          {applications.length ? (
            <div className="admin-table-wrap">
              <table className="admin-data-table">
                <thead><tr><th>BUSINESS</th><th>OWNER</th><th>STATUS</th><th>LA SOO GUDBIYEY</th></tr></thead>
                <tbody>{applications.slice(0, 5).map((item) => <tr key={item.id}><td><strong>{item.businessName}</strong><small>{item.category}</small></td><td>{item.ownerName}</td><td><StatusBadge value={item.status} /></td><td>{formatDate(item.submittedAt)}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <EmptyState title="Codsi ganacsi ma jiro" description="Applications cusub waxay halkan ka muuqan doonaan marka la diiwaangeliyo." />}
        </Panel>
        <Panel className="revenue-summary-panel">
          <PanelHeader title="Platform revenue" description="Lacagaha la xaqiijiyey; currency kasta si gooni ah.">
            <button className="button button-outline button-small" onClick={() => onNavigate("revenue")} type="button">Warbixin →</button>
          </PanelHeader>
          {Object.keys(revenueByCurrency).length ? (
            <div className="revenue-currency-list">
              {Object.entries(revenueByCurrency).map(([currency, amount]) => (
                <div className="revenue-currency" key={currency}>
                  <span><strong>{currency}</strong><small>Wadarta</small></span>
                  <div>
                    <strong>{new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)}</strong>
                    <small>Bishan: {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(monthlyRevenueByCurrency[currency] ?? 0)}</small>
                  </div>
                </div>
              ))}
              <span className="revenue-foot">{payments.length} lacag-bixin oo la xaqiijiyey · {monthlyPaymentCount} bishan</span>
            </div>
          ) : <EmptyState title="Weli dakhli lama xaqiijin" description="Revenue-ku wuxuu ka xisaabtamayaa platform payments la xaqiijiyey." />}
        </Panel>
      </div>
      <Panel className="admin-activity-panel">
        <PanelHeader title="Recent platform activity" description="Ficilladii ugu dambeeyay ee ku qornaa audit log-ga.">
          <button className="button button-outline button-small" onClick={() => onNavigate("audit")} type="button">Dhammaan eeg →</button>
        </PanelHeader>
        {auditLogs.length ? (
          <div className="admin-activity-list">
            {auditLogs.slice(0, 5).map((entry) => (
              <div className="admin-activity-row" key={entry.id}>
                <span className="admin-activity-icon">↗</span>
                <span><strong>{entry.action}</strong><small>{entry.entity} · {entry.record}</small></span>
                <time>{formatDateTime(entry.createdAt)}</time>
              </div>
            ))}
          </div>
        ) : <EmptyState title="Activity ma jiro" description="Ficillada maamulka ee la diiwaangeliyo ayaa halkan ka muuqan doona." />}
      </Panel>
      <div className="admin-disclaimer"><span>i</span> Guudmarku wuxuu muujinayaa xogta platform-ka oo keliya, mana soo bandhigayo xogta hawlgalka ganacsiyada.</div>
    </>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  accent = false,
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  icon: string;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`stat-card metric-card ${accent ? "stat-card-primary" : ""}`} onClick={onClick} type="button">
      <span className="stat-label">{label}<i className="stat-icon">{icon}</i></span>
      <strong className="stat-value">{value.toLocaleString()}</strong>
      <span className="stat-foot">{detail}</span>
    </button>
  );
}

function ApplicationsView({
  applications,
  archivedApplications,
  businessPresence,
  onExport,
  exporting,
  onOpenDetails,
  onRefresh,
  onReview,
  onDeletePermanently,
  deletingApplicationId,
  presenceError,
  query,
  setQuery,
  setStatusFilter,
  statusFilter,
}: {
  applications: BusinessApplication[];
  archivedApplications: BusinessApplication[];
  businessPresence: Record<string, { online: boolean; lastSeenAt: string }>;
  onExport: () => void | Promise<void>;
  exporting: boolean;
  onOpenDetails: (application: BusinessApplication) => void;
  onRefresh: () => void;
  onReview: (application: BusinessApplication, status: ApplicationFormStatus) => void;
  onDeletePermanently: (application: BusinessApplication) => void;
  deletingApplicationId: string | null;
  presenceError: string;
  query: string;
  setQuery: (value: string) => void;
  setStatusFilter: (value: string) => void;
  statusFilter: string;
}) {
  return (
    <>
      <PageHeading title="Business applications" description="Dib-u-eeg, raadso, ansixi ama diid codsiyada businesses-ka." />
      <Panel>
        <PanelHeader title="Codsiyada ganacsiyada" description={`${applications.length} codsi ayaa muuqda. Codsiyada cusub si toos ah ayay u soo cusboonaanayaan.`}>
          <Toolbar
            query={query}
            setQuery={setQuery}
            setStatusFilter={setStatusFilter}
            statusFilter={statusFilter}
            statuses={["Pending", "Under Review", "Approved", "Rejected"]}
            onExport={onExport}
            exportLabel="Word"
            exporting={exporting}
            extraAction={<button className="button button-outline button-small" onClick={onRefresh} type="button">Cusboonaysii</button>}
          />
        </PanelHeader>
        {presenceError && <p className="form-error" role="status">{presenceError} Apply the activity migration si online/offline loo arko.</p>}
        {applications.length ? (
          <div className="admin-table-wrap">
            <table className="admin-data-table">
              <thead><tr><th>BUSINESS / CATEGORY</th><th>APPLICANT</th><th>CONTACT</th><th>ONLINE</th><th>STATUS</th><th>TAARIIKH</th><th>FICIL</th></tr></thead>
              <tbody>{applications.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.businessName}</strong><small>{item.category} · {item.id}</small></td>
                  <td>{item.ownerName}</td><td><span>{item.email}</span><small>{item.phone || "—"}</small></td>
                  <td>
                    <span className={`presence-badge ${businessPresence[item.ownerUserId]?.online ? "presence-online" : "presence-offline"}`}>
                      <i />{presenceError ? "—" : businessPresence[item.ownerUserId]?.online ? "Online" : "Offline"}
                    </span>
                  </td>
                  <td><StatusBadge value={item.status} />{item.rejectionReason && <small className="table-reason">{item.rejectionReason}</small>}</td>
                  <td>{formatDate(item.submittedAt)}</td>
                  <td><div className="table-actions">
                    <button className="action-button" onClick={() => onOpenDetails(item)} type="button">Review</button>
                    {["Pending", "Under Review"].includes(item.status) && <button className="action-button action-good" onClick={() => onReview(item, "Approved")} type="button">Approve</button>}
                    {["Pending", "Under Review"].includes(item.status) && <button className="action-button action-danger" onClick={() => onReview(item, "Rejected")} type="button">Reject</button>}
                    {item.status === "Approved" && <button className="action-button action-good" onClick={() => onReview(item, "Approved")} type="button">Dib u dir invite</button>}
                    <button
                      className="action-button action-danger"
                      disabled={deletingApplicationId !== null}
                      onClick={() => onDeletePermanently(item)}
                      type="button"
                    >
                      {deletingApplicationId === item.id ? "Waa la tirtirayaa..." : "Delete permanently"}
                    </button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <EmptyState title={query || statusFilter !== "All statuses" ? "Natiijo lama helin" : "Codsiyo ma jiraan"} description="Codsiyada la soo gudbiyey ee ganacsiyada ayaa halkan ka muuqan doona." />}
      </Panel>
      {archivedApplications.length > 0 && (
        <Panel>
          <PanelHeader
            title="Codsiyada hore loo qariyey"
            description="Kuwaan wali database-ka ayay ku jiraan; isticmaal Delete permanently si account-ka iyo xogta oo dhan loo tirtiro."
          />
          <div className="admin-table-wrap">
            <table className="admin-data-table">
              <thead><tr><th>BUSINESS</th><th>APPLICANT</th><th>CONTACT</th><th>LA QARIYEY</th><th>FICIL</th></tr></thead>
              <tbody>{archivedApplications.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.businessName}</strong><small>{item.category} · {item.id}</small></td>
                  <td>{item.ownerName}</td>
                  <td><span>{item.email}</span><small>{item.phone || "—"}</small></td>
                  <td>{formatDate(item.archivedAt ?? item.submittedAt)}</td>
                  <td>
                    <button
                      className="action-button action-danger"
                      disabled={deletingApplicationId !== null}
                      onClick={() => onDeletePermanently(item)}
                      type="button"
                    >
                      {deletingApplicationId === item.id ? "Waa la tirtirayaa..." : "Delete permanently"}
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}

function BusinessesView({
  businesses,
  onExport,
  onSelect,
  onStatus,
  query,
  setQuery,
  setStatusFilter,
  statusFilter,
}: {
  businesses: Business[];
  onExport: () => void;
  onSelect: (business: Business) => void;
  onStatus: (business: Business, status: Business["status"]) => void;
  query: string;
  setQuery: (value: string) => void;
  setStatusFilter: (value: string) => void;
  statusFilter: string;
}) {
  return (
    <>
      <PageHeading title="Business directory" description="Arag oo maamul businesses-ka ka diiwaangashan VELTO." />
      <Panel>
        <PanelHeader title="Dhammaan businesses-ka" description={`${businesses.length} business ayaa muuqda.`}>
          <Toolbar query={query} setQuery={setQuery} setStatusFilter={setStatusFilter} statusFilter={statusFilter} statuses={["Active", "Suspended", "Archived"]} onExport={onExport} />
        </PanelHeader>
        {businesses.length ? (
          <div className="admin-table-wrap">
            <table className="admin-data-table">
              <thead><tr><th>BUSINESS</th><th>OWNER</th><th>CATEGORY</th><th>PLAN</th><th>BRANCHES</th><th>STATUS</th><th>REGISTERED</th><th>FICIL</th></tr></thead>
              <tbody>{businesses.map((item) => (
                <tr key={item.id}>
                  <td><button className="table-primary-link" onClick={() => onSelect(item)} type="button">{item.name}</button><small>{item.id} · {item.email}</small></td>
                  <td>{item.owner}</td><td>{item.category}</td><td>{item.plan || "No plan"}</td><td>{item.branches}</td><td><StatusBadge value={item.status} /></td><td>{formatDate(item.registeredAt)}</td>
                  <td><div className="table-actions"><button className="action-button" onClick={() => onSelect(item)} type="button">Details</button><select aria-label={`Xaaladda ${item.name}`} className="row-select" onChange={(event) => onStatus(item, event.target.value as Business["status"])} value={item.status}>{businessStatuses.map((status) => <option key={status}>{status}</option>)}</select></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <EmptyState title={query || statusFilter !== "All statuses" ? "Natiijo lama helin" : "Business wali lama diiwaangelin"} description="Ganacsiyada la ansixiyey ayaa halkan ka muuqan doona." />}
      </Panel>
    </>
  );
}

function CategoriesView({
  categories,
  canSeedDefaults,
  seedingDefaults,
  onCreate,
  onEdit,
  onSeedDefaults,
  onToggle,
  query,
  setQuery,
  setStatusFilter,
  statusFilter,
  showForm,
  editingCategory,
  formError,
  onSubmit,
  onCancel,
}: {
  categories: BusinessCategory[];
  canSeedDefaults: boolean;
  seedingDefaults: boolean;
  onCreate: () => void;
  onEdit: (category: BusinessCategory) => void;
  onSeedDefaults: () => void;
  onToggle: (category: BusinessCategory) => void;
  query: string;
  setQuery: (value: string) => void;
  setStatusFilter: (value: string) => void;
  statusFilter: string;
  showForm: boolean;
  editingCategory: BusinessCategory | null;
  formError: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <PageHeading title="Business categories" description="Samee industries oo ku xiro modules-ka ku habboon." action={<button className="button button-dark" onClick={onCreate} type="button"><span className="plus">+</span> Category cusub</button>} />
      <Panel>
        <PanelHeader title="Industries" description="Category la archive-gareeyo kama muuqanayo doorashooyinka cusub.">
          <Toolbar query={query} setQuery={setQuery} setStatusFilter={setStatusFilter} statusFilter={statusFilter} statuses={["Active", "Archived"]} />
        </PanelHeader>
        {categories.length ? <div className="category-grid">{categories.map((category) => (
          <article className="category-card" key={category.id}>
            <div className="category-card-head"><span className="category-icon">◫</span><StatusBadge value={category.status} /></div>
            <h3>{category.name}</h3><p>{category.description || "Sharaxaad lama darin."}</p>
            <div className="module-chips">{category.modules.length ? category.modules.map((module) => <span key={module}>{module}</span>) : <span>Module lama xirin</span>}</div>
            <div className="card-actions"><button className="action-button" onClick={() => onEdit(category)} type="button">Edit</button><button className="action-button" onClick={() => onToggle(category)} type="button">{category.status === "Active" ? "Archive" : "Dib u hawlgeli"}</button></div>
          </article>
        ))}</div> : <EmptyState title={query || statusFilter !== "All statuses" ? "Natiijo lama helin" : "Category lama samayn"} description="Abuur category oo ku xiro modules-ka industry-ga." action={!query && statusFilter === "All statuses" ? (
          <div className="empty-state-actions">
            <button className="text-link" onClick={onCreate} type="button">Category samee →</button>
            {canSeedDefaults && (
              <button className="button button-outline button-small" disabled={seedingDefaults} onClick={onSeedDefaults} type="button">
                {seedingDefaults ? "Waa la diyaarinayaa..." : "Ku dar categories-ka bilowga"}
              </button>
            )}
          </div>
        ) : undefined} />}
      </Panel>
      {showForm && <ModalForm title={editingCategory ? "Wax ka beddel category" : "Category cusub"} description="Ku qor industry-ga iyo modules-ka ganacsigiisa." onSubmit={onSubmit} onCancel={onCancel} error={formError}>
        <Field label="Magaca category-ga" name="name" required defaultValue={editingCategory?.name} />
        <Field label="Sharaxaad" name="description" defaultValue={editingCategory?.description} />
        <Field label="Modules (comma-separated)" name="modules" placeholder="Products, Inventory, Sales" defaultValue={editingCategory?.modules.join(", ")} />
        <ModulePicker selected={editingCategory?.modules ?? []} />
      </ModalForm>}
    </>
  );
}

function ModulePicker({ selected }: { selected: string[] }) {
  const [chosen, setChosen] = useState(selected);
  return (
    <div className="module-picker">
      <span>Dooro modules (waxaad ku beddeli kartaa liiska kore)</span>
      <div>{moduleOptions.map((module) => <button className={chosen.includes(module) ? "module-selected" : ""} key={module} onClick={(event) => {
        const current = event.currentTarget.closest(".admin-modal")?.querySelector<HTMLInputElement>('input[name="modules"]');
        const next = chosen.includes(module) ? chosen.filter((item) => item !== module) : [...chosen, module];
        setChosen(next);
        if (current) current.value = next.join(", ");
      }} type="button">{chosen.includes(module) && <span>✓</span>}{module}</button>)}</div>
    </div>
  );
}

function PlansView({
  plans,
  onCreate,
  onEdit,
  onToggle,
  query,
  setQuery,
  setStatusFilter,
  statusFilter,
  showForm,
  editingPlan,
  formError,
  onSubmit,
  onCancel,
}: {
  plans: SubscriptionPlan[];
  onCreate: () => void;
  onEdit: (plan: SubscriptionPlan) => void;
  onToggle: (plan: SubscriptionPlan) => void;
  query: string;
  setQuery: (value: string) => void;
  setStatusFilter: (value: string) => void;
  statusFilter: string;
  showForm: boolean;
  editingPlan: SubscriptionPlan | null;
  formError: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <PageHeading title="Subscription plans" description="Maamul qiimaha, billing interval, trial, xaddidaadaha iyo modules-ka." action={<button className="button button-dark" onClick={onCreate} type="button"><span className="plus">+</span> Plan cusub</button>} />
      <div className="decision-banner"><span>i</span><div><strong>Qiime go&apos;an lama dejin.</strong><span>Qiimaha iyo xaddidaad kasta geli oo ansixi ka hor inta aan plan loo qoondeyn business.</span></div></div>
      <Panel>
        <PanelHeader title="Plans-ka VELTO" description="Archive plan-ku wuxuu ka qarinayaa assignments cusub; subscriptions hore isma beddelaan.">
          <Toolbar query={query} setQuery={setQuery} setStatusFilter={setStatusFilter} statusFilter={statusFilter} statuses={["Active", "Archived"]} />
        </PanelHeader>
        {plans.length ? <div className="plan-grid">{plans.map((plan) => (
          <article className="plan-card" key={plan.id}>
            <div className="plan-card-head"><span>{plan.interval} billing</span><StatusBadge value={plan.status} /></div>
            <h3>{plan.name}</h3><p>{plan.description || "Sharaxaad lama darin."}</p>
            <div className="plan-price">{new Intl.NumberFormat("en-US", { style: "currency", currency: plan.currency }).format(plan.price)}<small> / {plan.interval === "Monthly" ? "bil" : "sannad"}</small></div>
            <div className="plan-limits"><span>{plan.maxUsers} users</span><span>{plan.maxBranches} branches</span><span>{plan.trialDays} maalmood trial</span></div>
            <div className="module-chips">{plan.modules.map((module) => <span key={module}>{module}</span>)}</div>
            <div className="card-actions"><button className="action-button" onClick={() => onEdit(plan)} type="button">Edit</button><button className="action-button" onClick={() => onToggle(plan)} type="button">{plan.status === "Active" ? "Archive" : "Dib u hawlgeli"}</button></div>
          </article>
        ))}</div> : <EmptyState title="Subscription plan ma jiro" description="Samee plan oo adigu ansixi qiimaha iyo xaddidaadaha." action={!query && statusFilter === "All statuses" ? <button className="text-link" onClick={onCreate} type="button">Plan samee →</button> : undefined} />}
      </Panel>
      {showForm && <ModalForm title={editingPlan ? "Wax ka beddel plan" : "Plan cusub"} description="Ku qor qiimaha iyo xaddidaadaha aad ansixisay." onSubmit={onSubmit} onCancel={onCancel} error={formError}>
        <Field label="Magaca plan-ka" name="name" required defaultValue={editingPlan?.name} />
        <Field label="Sharaxaad" name="description" defaultValue={editingPlan?.description} />
        <div className="form-row"><Field label="Qiime" name="price" type="number" min={0} step="0.01" required defaultValue={editingPlan?.price} /><Field label="Currency (ISO)" name="currency" placeholder="USD / SOS" required defaultValue={editingPlan?.currency} /></div>
        <Field label="Billing interval" name="interval" required>
          <select defaultValue={editingPlan?.interval ?? "Monthly"} name="interval"><option>Monthly</option><option>Yearly</option></select>
        </Field>
        <div className="form-row"><Field label="Trial duration (days)" name="trialDays" type="number" min={0} defaultValue={editingPlan?.trialDays ?? 0} /><Field label="Maximum users" name="maxUsers" type="number" min={1} required defaultValue={editingPlan?.maxUsers ?? 5} /><Field label="Maximum branches" name="maxBranches" type="number" min={1} required defaultValue={editingPlan?.maxBranches ?? 1} /></div>
        <Field label="Modules (comma-separated)" name="modules" placeholder="Products, Inventory, Sales" defaultValue={editingPlan?.modules.join(", ")} />
        <ModulePicker selected={editingPlan?.modules ?? []} />
      </ModalForm>}
    </>
  );
}

function SubscriptionsView({
  subscriptions,
  businesses,
  plans,
  onCreate,
  onStatus,
  query,
  setQuery,
  setStatusFilter,
  statusFilter,
  showForm,
  formError,
  onSubmit,
  onCancel,
}: {
  subscriptions: Subscription[];
  businesses: Business[];
  plans: SubscriptionPlan[];
  onCreate: () => void;
  onStatus: (subscription: Subscription, status: Subscription["status"]) => void;
  query: string;
  setQuery: (value: string) => void;
  setStatusFilter: (value: string) => void;
  statusFilter: string;
  showForm: boolean;
  formError: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <PageHeading title="Subscription management" description="Qoondee ama beddel plan-ka iyo xaaladda subscription-ka business kasta." action={<button className="button button-dark" disabled={!businesses.length || !plans.length} onClick={onCreate} type="button"><span className="plus">+</span> Assign plan</button>} />
      <Panel>
        <PanelHeader title="Subscriptions" description={`${subscriptions.length} subscription ayaa ka diiwaangashan platform-ka.`}>
          <Toolbar query={query} setQuery={setQuery} setStatusFilter={setStatusFilter} statusFilter={statusFilter} statuses={["Trial", "Active", "Past due", "Cancelled", "Expired", "Suspended"]} />
        </PanelHeader>
        {subscriptions.length ? <div className="admin-table-wrap"><table className="admin-data-table">
          <thead><tr><th>BUSINESS</th><th>PLAN</th><th>STATUS</th><th>BILLING</th><th>RENEWS</th><th>FICIL</th></tr></thead>
          <tbody>{subscriptions.map((subscription) => {
            const business = businesses.find((item) => item.id === subscription.businessId);
            const plan = plans.find((item) => item.id === subscription.planId);
            return <tr key={subscription.id}><td><strong>{business?.name ?? "Ganacsi"}</strong><small>{subscription.id}</small></td><td>{plan?.name ?? "Plan"}{plan && <small>{plan.currency} {plan.price} / {plan.interval.toLowerCase()}</small>}</td><td><StatusBadge value={subscription.status} /></td><td>{plan?.interval ?? "—"}</td><td>{formatDate(subscription.renewsAt)}</td><td><select aria-label="Subscription status" className="row-select" onChange={(event) => onStatus(subscription, event.target.value as Subscription["status"])} value={subscription.status}>{["Trial", "Active", "Past due", "Cancelled", "Expired", "Suspended"].map((status) => <option key={status}>{status}</option>)}</select></td></tr>;
          })}</tbody>
        </table></div> : <EmptyState title="Subscription wali lama qoondeyn" description="Waxaad u baahan tahay business iyo plan Active si aad u bilowdo." />}
      </Panel>
      {showForm && <ModalForm title="Assign subscription plan" description="Plan-ka ganacsiga ayaa si degdeg ah loogu qoondeynayaa." onSubmit={onSubmit} onCancel={onCancel} error={formError}>
        <Field label="Business" name="businessId" required><select defaultValue="" name="businessId" required><option disabled value="">Business dooro</option>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name} · {business.owner}</option>)}</select></Field>
        <Field label="Subscription plan" name="planId" required><select defaultValue="" name="planId" required><option disabled value="">Plan dooro</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.currency} {plan.price} / {plan.interval.toLowerCase()}</option>)}</select></Field>
        <CurrentDateField label="Renewal date" name="renewsAt" required />
        <p className="form-hint">Tani waxay kaydinaysaa xaaladda subscription-ka oo keliya; lacag-qaadis otomaatig ah kuma xirna.</p>
      </ModalForm>}
    </>
  );
}

function PaymentsView({
  payments,
  businesses,
  onCreate,
  onExport,
  onStatus,
  query,
  setQuery,
  setStatusFilter,
  statusFilter,
  showForm,
  formError,
  onSubmit,
  onCancel,
}: {
  payments: PlatformPayment[];
  businesses: Business[];
  onCreate: () => void;
  onExport: () => void;
  onStatus: (payment: PlatformPayment, status: PlatformPayment["status"]) => void;
  query: string;
  setQuery: (value: string) => void;
  setStatusFilter: (value: string) => void;
  statusFilter: string;
  showForm: boolean;
  formError: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <PageHeading title="Platform payments" description="Kormeer payments-ka VELTO subscription-ka; ma aha lacagaha iibka business-ka." action={<button className="button button-dark" disabled={!businesses.length} onClick={onCreate} type="button"><span className="plus">+</span> Payment geli</button>} />
      <div className="decision-banner"><span>i</span><div><strong>Zaad/eDahab checkout otomaatig ah wali lama xirin.</strong><span>Diiwaangeli transaction-ka la xaqiijiyey; records-ka cusub waxay ku bilaabmaan Pending ilaa gacanta lagu hubiyo.</span></div></div>
      <Panel>
        <PanelHeader title="Platform payment records" description="Kaliya Verified payments ayaa lagu daraa revenue-ga.">
          <Toolbar query={query} setQuery={setQuery} setStatusFilter={setStatusFilter} statusFilter={statusFilter} statuses={["Pending", "Verified", "Failed", "Refunded"]} onExport={onExport} />
        </PanelHeader>
        {payments.length ? <div className="admin-table-wrap"><table className="admin-data-table">
          <thead><tr><th>PAYMENT / REF</th><th>BUSINESS</th><th>PROVIDER</th><th>AMOUNT</th><th>TAARIIKH</th><th>STATUS</th><th>FICIL</th></tr></thead>
          <tbody>{payments.map((payment) => <tr key={payment.id}><td><strong>{payment.id}</strong><small>{payment.reference}</small></td><td>{businessName(payment.businessId, businesses)}</td><td>{payment.provider}</td><td className="money-cell">{new Intl.NumberFormat("en-US", { style: "currency", currency: payment.currency }).format(payment.amount)}</td><td>{formatDate(payment.paidAt)}</td><td><StatusBadge value={payment.status} /></td><td><select aria-label="Payment status" className="row-select" onChange={(event) => onStatus(payment, event.target.value as PlatformPayment["status"])} value={payment.status}>{["Pending", "Verified", "Failed", "Refunded"].map((status) => <option key={status}>{status}</option>)}</select></td></tr>)}</tbody>
        </table></div> : <EmptyState title="Payment record ma jiro" description="Payment records ka yimid subscription-ka VELTO ayaa halkan ka muuqan doona." />}
      </Panel>
      {showForm && <ModalForm title="Diiwaangeli platform payment" description="Tani waxay abuuraysaa record Pending, mana xaqiijinayso lacag bixinta." onSubmit={onSubmit} onCancel={onCancel} error={formError}>
        <Field label="Business" name="businessId" required><select defaultValue="" name="businessId" required><option disabled value="">Business dooro</option>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select></Field>
        <Field label="Amount" name="amount" type="number" min={0.01} step="0.01" required />
        <Field label="Currency (ISO)" name="currency" placeholder="USD / SOS" required />
        <Field label="Provider" name="provider" required>
          <select defaultValue="Zaad" name="provider">
            <option value="Zaad">Zaad</option>
            <option value="eDahab">eDahab</option>
            <option value="Manual">Manual</option>
          </select>
        </Field>
        <Field label="Transaction reference" name="reference" required />
        <CurrentDateField label="Payment date" name="paidAt" required />
      </ModalForm>}
    </>
  );
}

function RevenueView({ payments, revenueByCurrency }: { payments: PlatformPayment[]; revenueByCurrency: Record<string, number> }) {
  const total = Object.values(revenueByCurrency).reduce((sum, amount) => sum + amount, 0);
  return (
    <>
      <PageHeading title="Revenue analytics" description="Revenue-ga platform-ka waxa laga xisaabiyaa payments Verified oo keliya." />
      <div className="revenue-stats">
        <div className="stat-card stat-card-primary"><span className="stat-label">VERIFIED PAYMENTS</span><strong className="stat-value">{payments.length}</strong><span className="stat-foot">Transaction si manual ah loo hubiyey</span></div>
        <div className="stat-card"><span className="stat-label">TOTAL VALUE (NO FX CONVERSION)</span><strong className="stat-value">{total.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong><span className="stat-foot">Lacagaha kala duwan lama isku beddelin</span></div>
        {Object.entries(revenueByCurrency).map(([currency, amount]) => <div className="stat-card" key={currency}><span className="stat-label">{currency} VERIFIED REVENUE</span><strong className="stat-value">{new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)}</strong><span className="stat-foot">Platform subscription income</span></div>)}
      </div>
      <Panel>
        <PanelHeader title="Revenue transactions" description="Business sales laguma darin platform revenue.">
          <button className="button button-outline button-small" onClick={() => downloadCsv("velto-revenue.csv", [["Payment", "Amount", "Currency", "Date"], ...payments.map((payment) => [payment.reference, payment.amount, payment.currency, payment.paidAt])])} type="button">Soo dejiso CSV ↓</button>
        </PanelHeader>
        {payments.length ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>REFERENCE</th><th>BUSINESS</th><th>AMOUNT</th><th>DATE</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td><strong>{payment.reference}</strong></td><td>{payment.businessId}</td><td>{new Intl.NumberFormat("en-US", { style: "currency", currency: payment.currency }).format(payment.amount)}</td><td>{formatDate(payment.paidAt)}</td></tr>)}</tbody></table></div> : <EmptyState title="Revenue data ma jiro" description="Marka platform payment loo calaamadeeyo Verified ayaa halkan ka soo muuqanaya." />}
      </Panel>
    </>
  );
}

function UsersView({
  users,
  query,
  setQuery,
}: {
  users: PlatformUser[];
  query: string;
  setQuery: (value: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const response = await fetch("/api/admin/platform-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          displayName: formData.get("displayName"),
        }),
      });
      const result = await response.json() as { error?: string; email?: string };
      if (!response.ok) {
        setError(result.error ?? "Martiqaadku ma guulaysan.");
        return;
      }
      form.reset();
      setMessage(`Martiqaad Super Admin ah ayaa loo diray ${result.email}.`);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Codsiga server-ka ma gaarin.");
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(user: PlatformUser) {
    if (!window.confirm(`Ma hubtaa inaad ka saarayso Super Admin ${user.email}?`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/platform-users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Akoonka lama saarin.");
        return;
      }
      setMessage(`${user.email} waa laga saaray platform-ka.`);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Codsiga server-ka ma gaarin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading title="Platform users" description="Martiqaad ama ka saar Super Admin. Isbeddel kasta waxaa lagu diiwaangeliyaa audit log." />
      <Panel>
        <PanelHeader title="Super Admin accounts" description={`${users.length} akoon maamul oo ka diiwaangashan platform-ka.`}>
          <Toolbar query={query} setQuery={setQuery} />
        </PanelHeader>
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="workspace-notice" role="status">{message}</p>}
        {users.length ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>MAGACA</th><th>EMAIL</th><th>ROLE</th><th>TAARIIKH</th><th>FICIL</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><div className="person-cell"><span className="person-avatar">{initials(user.name)}</span><strong>{user.name}</strong></div></td><td>{user.email}</td><td><span className="role-pill">{user.role}</span></td><td>{formatDate(user.createdAt)}</td><td>{user.role === "Platform Administrator" ? <button className="action-button action-danger" disabled={busy} onClick={() => removeUser(user)} type="button">Ka saar</button> : "—"}</td></tr>)}</tbody></table></div> : <EmptyState title="Platform user wali lama darin" description="Super Admin account-ka koowaad waa in si ammaan ah looga abuuraa Supabase Auth." />}
      </Panel>
      <Panel>
        <PanelHeader title="Super Admin cusub ku martiqaad" description="Akoonka waxaa lagu dari karaa oo keliya martiqaad Supabase Auth ah." />
        <form className="settings-form" onSubmit={inviteUser}>
          <div className="form-row">
            <label className="admin-field"><span>Magaca <i>*</i></span><input autoComplete="name" maxLength={120} name="displayName" required /></label>
            <label className="admin-field"><span>Email <i>*</i></span><input autoComplete="email" maxLength={254} name="email" required type="email" /></label>
          </div>
          <p className="form-hint">Waxay u baahan tahay SUPABASE_SERVICE_ROLE_KEY oo server-ka oo keliya lagu dejiyey; furaha laguma daro browser-ka.</p>
          <div className="settings-footer"><span>Iska ilaali in aad Super Admin u martiqaaddo qof aan la xaqiijin.</span><button className="button button-dark" disabled={busy} type="submit">{busy ? "Waa la shaqaynayaa..." : "Martiqaad dir"}</button></div>
        </form>
      </Panel>
    </>
  );
}

function SupportView({
  tickets,
  onStatus,
  query,
  setQuery,
  setStatusFilter,
  statusFilter,
}: {
  tickets: SupportTicket[];
  onStatus: (ticket: SupportTicket, status: TicketStatus) => void;
  query: string;
  setQuery: (value: string) => void;
  setStatusFilter: (value: string) => void;
  statusFilter: string;
}) {
  return (
    <>
      <PageHeading title="Support tickets" description="La soco codsiyada businesses-ka, kala hormari oo xalli." />
      <Panel>
        <PanelHeader title="Codsiyada support-ka" description={`${tickets.length} ticket ayaa muuqda.`}>
          <Toolbar query={query} setQuery={setQuery} setStatusFilter={setStatusFilter} statusFilter={statusFilter} statuses={["Open", "In progress", "Resolved", "Closed"]} />
        </PanelHeader>
        {tickets.length ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>TICKET</th><th>BUSINESS / REQUESTER</th><th>CATEGORY</th><th>PRIORITY</th><th>CREATED</th><th>STATUS</th></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id}><td><strong>{ticket.subject}</strong><small>{ticket.id}</small></td><td>{ticket.business}<small>{ticket.requester}</small></td><td>{ticket.category}</td><td><StatusBadge value={ticket.priority} /></td><td>{formatDate(ticket.createdAt)}</td><td><select aria-label="Ticket status" className="row-select" onChange={(event) => onStatus(ticket, event.target.value as TicketStatus)} value={ticket.status}>{["Open", "In progress", "Resolved", "Closed"].map((status) => <option key={status}>{status}</option>)}</select></td></tr>)}</tbody></table></div> : <EmptyState title="Support ticket ma jiro" description="Codsiyada la diiwaangeliyo ayaa halkan lagu maamuli doonaa." />}
      </Panel>
    </>
  );
}

function NotificationsView({
  notifications,
  onCreate,
  onToggle,
  onReadAll,
  showForm,
  formError,
  onSubmit,
  onCancel,
}: {
  notifications: PlatformNotification[];
  onCreate: () => void;
  onToggle: (notification: PlatformNotification) => void;
  onReadAll: () => void;
  showForm: boolean;
  formError: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <PageHeading title="Platform notifications" description="Maamul ogeysiisyada maamulka iyo xaaladda akhriskooda." action={<div className="heading-actions"><button className="button button-outline button-small" onClick={onReadAll} type="button">Dhammaan akhri</button><button className="button button-dark" onClick={onCreate} type="button"><span className="plus">+</span> Ogeysiis cusub</button></div>} />
      <AdminPushControls />
      <Panel>
        <PanelHeader title="Ogeysiisyada" description={`${notifications.filter((item) => !item.read).length} aan la akhrin`} />
        {notifications.length ? <div className="notification-list">{notifications.map((item) => <article className={`notification-row ${item.read ? "notification-read" : ""}`} key={item.id}><span className="notification-bullet">{item.read ? "✓" : "•"}</span><div><strong>{item.title}</strong><p>{item.message}</p><small>{formatDateTime(item.createdAt)}</small></div><button className="action-button" onClick={() => onToggle(item)} type="button">{item.read ? "Aan la akhrin" : "Akhri"}</button></article>)}</div> : <EmptyState title="Ogeysiis ma jiro" description="Platform events iyo ogeysiisyada aad samayso ayaa halkan ka soo muuqan doona." />}
      </Panel>
      {showForm && <ModalForm title="Ogeysiis cusub" description="Ku kaydi ogeysiis heer-platform ah." onSubmit={onSubmit} onCancel={onCancel} error={formError}>
        <Field label="Cinwaan" name="title" required />
        <Field label="Farriin" name="message" required><textarea name="message" required rows={4} /></Field>
        <p className="form-hint">Email, SMS ama WhatsApp delivery provider lama xirin.</p>
      </ModalForm>}
    </>
  );
}

function AuditView({
  entries,
  onExport,
  query,
  setQuery,
}: {
  entries: AuditEntry[];
  onExport: () => void;
  query: string;
  setQuery: (value: string) => void;
}) {
  return (
    <>
      <PageHeading title="Platform audit logs" description="Diiwaanka joogtada ah ee ficillada maamulka heer-platform." />
      <Panel>
        <PanelHeader title="Activity history" description={`${entries.length} audit event ayaa muuqda.`}>
          <Toolbar query={query} setQuery={setQuery} onExport={onExport} />
        </PanelHeader>
        {entries.length ? <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>FICIL</th><th>ENTITY</th><th>RECORD</th><th>WAQTIGA (UTC)</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td><strong>{entry.action}</strong></td><td>{entry.entity}</td><td>{entry.record}</td><td>{formatDateTime(entry.createdAt)}</td></tr>)}</tbody></table></div> : <EmptyState title="Audit log wali ma jiro" description="Ficillada aad samayso sida approve, suspend iyo plan assignment ayaa la diiwaangelin doonaa." />}
      </Panel>
    </>
  );
}

function SettingsView({
  settings,
  onSave,
  error,
}: {
  settings: PlatformSettings;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  error: string;
}) {
  return (
    <>
      <PageHeading title="Platform settings" description="Dejimaha guud ee VELTO, oo lagu kaydiyo Supabase." />
      <Panel className="settings-panel">
        <PanelHeader title="General settings" description="Dejinta hoose waxaa ilaaliya Super Admin authorization iyo RLS." />
        <form className="settings-form" onSubmit={onSave}>
          <div className="form-row"><Field label="Magaca platform-ka" name="platformName" defaultValue={settings.platformName} required /><Field label="Support email" name="supportEmail" type="email" placeholder="support@example.com" defaultValue={settings.supportEmail} /></div>
          <div className="form-row"><Field label="Default currency (ISO)" name="defaultCurrency" placeholder="USD / SOS" defaultValue={settings.defaultCurrency} /><Field label="Timezone" name="timezone" defaultValue={settings.timezone} required /></div>
          <div className="settings-toggles">
            <ToggleField label="Business registration" description="U oggolow ganacsiyada inay codsi soo gudbiyaan." name="registrationOpen" checked={settings.registrationOpen} />
            <ToggleField label="Maintenance mode" description="Digniin dayactir ayaa ka muuqan karta portal-ka." name="maintenanceMode" checked={settings.maintenanceMode} />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="settings-footer"><span>Isbeddellada waxaa lagu kaydiyaa database-ka platform-ka.</span><button className="button button-dark" type="submit">Kaydi dejinta <span>→</span></button></div>
        </form>
      </Panel>
      <Panel className="settings-panel">
        <PanelHeader title="WhatsApp Support" description="Deji lambarka WhatsApp Business, Cloud API credentials, webhook, support hours iyo templates." />
        <div className="settings-footer">
          <span>Credentials-ka waxa lagu xafiday server-ka; waligood browser-ka looma soo celiyo.</span>
          <Link className="button button-outline" href="/admin/whatsapp-support?tab=settings">Fur WhatsApp settings <span>→</span></Link>
        </div>
      </Panel>
    </>
  );
}

function ToggleField({
  label,
  description,
  name,
  checked,
}: {
  label: string;
  description: string;
  name: string;
  checked: boolean;
}) {
  return (
    <label className="toggle-row">
      <span><strong>{label}</strong><small>{description}</small></span>
      <input defaultChecked={checked} name={name} type="checkbox" />
      <i aria-hidden="true" />
    </label>
  );
}

function BusinessDetails({
  business,
  onClose,
  onStatus,
  subscription,
  plan,
}: {
  business: Business;
  onClose: () => void;
  onStatus: (business: Business, status: Business["status"]) => void;
  subscription?: Subscription;
  plan?: SubscriptionPlan;
}) {
  return (
    <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-labelledby="business-modal-title" aria-modal="true" className="admin-modal business-details-modal" role="dialog">
        <div className="admin-modal-heading"><div><div className="page-eyebrow">{business.id}</div><h2 id="business-modal-title">{business.name}</h2><p>Business profile iyo subscription summary.</p></div><button className="close-form" onClick={onClose} type="button" aria-label="Xir">×</button></div>
        <div className="business-detail-grid">
          <DetailItem label="Milkiilaha" value={business.owner} />
          <DetailItem label="Email" value={business.email} />
          <DetailItem label="Telefoon" value={business.phone || "—"} />
          <DetailItem label="Category" value={business.category} />
          <DetailItem label="Business status" value={<StatusBadge value={business.status} />} />
          <DetailItem label="Registration date" value={formatDate(business.registeredAt)} />
          <DetailItem label="Branches" value={business.branches} />
          <DetailItem label="Subscription" value={subscription ? `${plan?.name ?? "Plan"} · ${subscription.status}` : "No subscription"} />
          {subscription && <DetailItem label="Renewal date" value={formatDate(subscription.renewsAt)} />}
        </div>
        <div className="admin-form-actions">
          <button className="button button-outline button-small" onClick={onClose} type="button">Xir</button>
          <select aria-label="Business status" className="row-select" onChange={(event) => onStatus(business, event.target.value as Business["status"])} value={business.status}>{businessStatuses.map((status) => <option key={status}>{status}</option>)}</select>
        </div>
      </section>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return <div className="business-detail-item"><span>{label}</span><strong>{value}</strong></div>;
}
