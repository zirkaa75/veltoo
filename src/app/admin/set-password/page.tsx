import { Suspense } from "react";
import { connection } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/authorization";
import SetPlatformPassword from "./set-platform-password";
import PortalSplashScreen from "@/components/auth/portal-splash-screen";

export const instant = true;

export default function SetPlatformPasswordPage() {
  return (
    <Suspense fallback={<PlatformPasswordLoading />}>
      <SetPlatformPasswordContent />
    </Suspense>
  );
}

async function SetPlatformPasswordContent() {
  await connection();
  await requirePlatformAdmin();
  return (
    <PortalSplashScreen portal="admin" welcome="Welcome Back, Super Admin.">
      <section className="portal-invitation-card"><SetPlatformPassword /></section>
    </PortalSplashScreen>
  );
}

function PlatformPasswordLoading() {
  return (
    <main className="auth-page" aria-live="polite">
      <section className="auth-card">
        <div className="auth-kicker">SUPER ADMIN ACCOUNT</div>
        <h1>Aqoonsiga waa la xaqiijinayaa.</h1>
      </section>
    </main>
  );
}
