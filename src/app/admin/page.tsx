import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/authorization";

export const instant = true;

export default function AdminEntryPage() {
  return (
    <Suspense fallback={<AdminEntryLoading />}>
      <AdminEntryContent />
    </Suspense>
  );
}

async function AdminEntryContent() {
  await connection();
  await requirePlatformAdmin();
  redirect("/admin/dashboard");
  return null;
}

function AdminEntryLoading() {
  return (
    <main className="auth-page" aria-live="polite">
      <section className="auth-card">
        <div className="auth-kicker">SUPER ADMIN PORTAL</div>
        <h1>Maamulka waa la furayaa.</h1>
      </section>
    </main>
  );
}
