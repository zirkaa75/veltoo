import { connection } from "next/server";
import { Suspense } from "react";
import { requireBusinessAccount } from "@/lib/auth/authorization";
import SetBusinessPassword from "../../app/set-password/set-business-password";
import PortalSplashScreen from "@/components/auth/portal-splash-screen";

export default function BusinessSetPasswordPage() {
  return (
    <Suspense fallback={<main className="portal-invitation-loading">VELTO</main>}>
      <BusinessSetPasswordContent />
    </Suspense>
  );
}

async function BusinessSetPasswordContent() {
  await connection();
  await requireBusinessAccount();
  return (
    <PortalSplashScreen portal="business" welcome="Welcome to Your Business Workspace.">
      <section className="portal-invitation-card">
        <SetBusinessPassword />
      </section>
    </PortalSplashScreen>
  );
}
