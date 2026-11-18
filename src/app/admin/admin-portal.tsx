import { connection } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/authorization";
import AdminDashboardPage, { type SectionId } from "./dashboard/console";

export async function AdminPortalContent({ initialSection }: { initialSection: SectionId }) {
  await connection();
  const { user } = await requirePlatformAdmin();
  const adminName = typeof user.user_metadata.full_name === "string"
    ? user.user_metadata.full_name
    : user.email ?? "Super Admin";

  return <AdminDashboardPage adminName={adminName} initialSection={initialSection} />;
}

export function AdminPortalLoading() {
  return (
    <main className="auth-page admin-auth-page" aria-live="polite">
      <section className="auth-card admin-auth-card">
        <div className="auth-kicker">SUPER ADMIN PORTAL</div>
        <h1>Dashboard-ka maamulka waa la furayaa.</h1>
        <p className="auth-description">Sug inta xogta platform-ka la xaqiijinayo.</p>
      </section>
    </main>
  );
}
