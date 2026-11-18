import { Suspense } from "react";
import { AdminPortalContent, AdminPortalLoading } from "../admin-portal";

export const instant = true;

export default function AdminDashboardRoute() {
  return (
    <Suspense fallback={<AdminPortalLoading />}>
      <AdminPortalContent initialSection="overview" />
    </Suspense>
  );
}
