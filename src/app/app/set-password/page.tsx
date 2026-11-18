import { Suspense } from "react";
import { connection } from "next/server";
import { requireBusinessAccount } from "@/lib/auth/authorization";
import SetBusinessPassword from "./set-business-password";
import PortalSplashScreen from "@/components/auth/portal-splash-screen";

export const instant = true;

export default function SetBusinessPasswordPage() {
  return (
    <Suspense fallback={<BusinessPasswordLoading />}>
      <SetBusinessPasswordContent />
    </Suspense>
  );
}

async function SetBusinessPasswordContent() {
  await connection();
  await requireBusinessAccount();
  return (
    <PortalSplashScreen portal="business" welcome="Welcome to Your Business Workspace.">
      <section className="portal-invitation-card"><SetBusinessPassword /></section>
    </PortalSplashScreen>
  );
}

function BusinessPasswordLoading() {
  return (
    <main className="auth-page" aria-live="polite">
      <section className="auth-card">
        <div className="auth-kicker">BUSINESS WORKSPACE</div>
        <h1>Aqoonsiga waa la xaqiijinayaa.</h1>
      </section>
    </main>
  );
}
