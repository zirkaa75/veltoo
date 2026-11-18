import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminPortalContent, AdminPortalLoading } from "../admin-portal";
import type { SectionId } from "../dashboard/console";

export const instant = true;

const routeSections: Record<string, SectionId> = {
  applications: "applications",
  businesses: "businesses",
  categories: "categories",
  "workspace-builder": "workspace-builder",
  plans: "plans",
  subscriptions: "subscriptions",
  payments: "payments",
  revenue: "revenue",
  users: "users",
  support: "support",
  notifications: "notifications",
  audit: "audit",
  settings: "settings",
};

export default function AdminSectionRoute({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  return (
    <Suspense fallback={<AdminPortalLoading />}>
      <AdminSectionContent params={params} />
    </Suspense>
  );
}

async function AdminSectionContent({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  await connection();
  const { section } = await params;
  const initialSection = routeSections[section];
  if (!initialSection) notFound();

  return <AdminPortalContent initialSection={initialSection} />;
}
