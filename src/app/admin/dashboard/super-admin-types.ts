export type PlatformUser = {
  id: string;
  name: string;
  email: string;
  role: "Platform Administrator" | "Support Staff";
  createdAt: string;
};

export type ApplicationStatus =
  | "Pending"
  | "Under Review"
  | "Approved"
  | "Rejected";

export type BusinessApplication = {
  id: string;
  ownerUserId: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  category: string;
  status: ApplicationStatus;
  submittedAt: string;
  rejectionReason: string;
  archivedAt?: string;
};

export type BusinessStatus = "Active" | "Suspended" | "Archived";

export type Business = {
  id: string;
  name: string;
  owner: string;
  email: string;
  phone: string;
  category: string;
  status: BusinessStatus;
  plan: string;
  branches: number;
  registeredAt: string;
};

export type BusinessCategory = {
  id: string;
  name: string;
  description: string;
  modules: string[];
  status: "Active" | "Archived";
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: "Monthly" | "Yearly";
  trialDays: number;
  maxUsers: number;
  maxBranches: number;
  modules: string[];
  status: "Active" | "Archived";
};

export type SubscriptionStatus =
  | "Trial"
  | "Active"
  | "Past due"
  | "Cancelled"
  | "Expired"
  | "Suspended";

export type Subscription = {
  id: string;
  businessId: string;
  planId: string;
  status: SubscriptionStatus;
  startedAt: string;
  renewsAt: string;
};

export type PaymentStatus = "Pending" | "Verified" | "Failed" | "Refunded";

export type PlatformPayment = {
  id: string;
  businessId: string;
  reference: string;
  provider: string;
  amount: number;
  currency: string;
  paidAt: string;
  status: PaymentStatus;
};

export type SupportPriority = "Low" | "Normal" | "High" | "Urgent";
export type SupportStatus = "Open" | "In progress" | "Resolved" | "Closed";

export type SupportTicket = {
  id: string;
  business: string;
  requester: string;
  subject: string;
  category: string;
  priority: SupportPriority;
  status: SupportStatus;
  createdAt: string;
};

export type PlatformNotification = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
};

export type AuditEntry = {
  id: string;
  action: string;
  entity: string;
  record: string;
  createdAt: string;
};

export type PlatformSettings = {
  platformName: string;
  supportEmail: string;
  defaultCurrency: string;
  timezone: string;
  registrationOpen: boolean;
  maintenanceMode: boolean;
};
