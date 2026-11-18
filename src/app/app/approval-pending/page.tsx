import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireBusinessAccount } from "@/lib/auth/authorization";
import PortalSplashScreen from "@/components/auth/portal-splash-screen";
import ApprovalWorkspaceRedirect from "./approval-workspace-redirect";

export const instant = true;

export default function ApprovalPendingPage() {
  return (
    <Suspense fallback={<ApprovalPendingLoading />}>
      <ApprovalPendingContent />
    </Suspense>
  );
}

async function ApprovalPendingContent() {
  await connection();
  const { supabase, user } = await requireBusinessAccount();
  const { data: membership } = await supabase.from("business_users").select("business_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (membership) redirect(`/app/workspace/${membership.business_id}`);
  const { data: application } = await supabase.from("business_applications").select("business_name, status, rejection_reason").eq("owner_user_id", user.id).maybeSingle();
  if (!application) redirect("/app/register");

  return (
    <PortalSplashScreen portal="business" welcome="Welcome to Your Business Workspace.">
      <ApprovalWorkspaceRedirect />
      <section className="portal-invitation-card">
        <div className="auth-icon" aria-hidden="true">◷</div>
        <div className="auth-kicker">APPLICATION STATUS</div>
        <h1>
          {application.status === "rejected"
            ? "Codsiga waa la diiday."
            : application.status === "pending"
              ? "Sug inta lagu aqbalayo."
              : application.status === "approved"
                ? "Codsiga waa la ansixiyey."
              : "Codsigaaga waa la eegayaa."}
        </h1>
        <p className="auth-description"><strong>{application.business_name}</strong> — xaaladda codsiga: <span className={`admin-status status-${application.status === "rejected" ? "danger" : "warning"}`}><i />{application.status}</span></p>
        {application.rejection_reason && <p className="form-error">Sababta: {application.rejection_reason}</p>}
        <div className="demo-hint"><span className="demo-hint-icon">i</span><span>{application.status === "approved"
          ? "Workspace-ka waa la diyaarinayaa; si toos ah ayaa laguugu gudbin doonaa."
          : "Marka la ansixiyo, business owner-ku wuxuu heli doonaa workspace gaar ah."}</span></div>
      </section>
    </PortalSplashScreen>
  );
}

function ApprovalPendingLoading() {
  return (
    <main className="auth-page" aria-live="polite">
      <section className="auth-card">
        <div className="auth-kicker">APPLICATION STATUS</div>
        <h1>Codsigaaga waa la hubinayaa.</h1>
        <p className="auth-description">Sug inta xaaladda codsiga laga xaqiijinayo.</p>
      </section>
    </main>
  );
}
