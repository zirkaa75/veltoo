import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { requireBusinessAccount } from "@/lib/auth/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import CompleteRegistrationPhone from "./complete-registration-phone";

export const instant = true;

export default function CompleteBusinessRegistrationPage() {
  return (
    <Suspense fallback={<RegistrationLoading />}>
      <CompleteBusinessRegistrationContent />
    </Suspense>
  );
}

async function CompleteBusinessRegistrationContent() {
  await connection();
  const { supabase, user } = await requireBusinessAccount();

  const businessName = user.user_metadata.pending_business_name;
  const category = user.user_metadata.pending_business_category;
  const ownerName = user.user_metadata.full_name;
  const phone = user.user_metadata.pending_business_phone;

  if (typeof businessName !== "string" || typeof category !== "string" || typeof ownerName !== "string") {
    redirect("/app/register?error=missing-business-details");
  }
  if (typeof phone !== "string" || !phone.trim()) {
    return <CompleteRegistrationPhone />;
  }

  const { data: existing, error: lookupError } = await supabase
    .from("business_applications")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (lookupError) {
    return <RegistrationResult message="Codsiga lama hubin karin. Fadlan mar kale gal ama la xiriir support." />;
  }

  if (!existing) {
    const { error: insertError } = await supabase.from("business_applications").insert({
      owner_user_id: user.id,
      business_name: businessName,
      owner_name: ownerName,
      email: user.email ?? "",
      phone,
      category,
      status: "pending",
    });

    if (insertError) {
      if (
        insertError.code === "23505"
        && insertError.message.includes("business_applications_owner_user_id_key")
      ) {
        redirect("/app/approval-pending");
      }

      const errorDetails = {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
      };
      console.error(`Business application insert failed: ${JSON.stringify(errorDetails)}`);
      return <RegistrationResult message={applicationInsertMessage(insertError)} />;
    }

    let notificationFailed = false;
    try {
      const admin = createAdminClient();
      const { error: notificationError } = await admin.from("platform_notifications").insert({
        title: "Business application cusub",
        message: `${businessName} — ${ownerName} wuxuu gudbiyey codsi ganacsi.`,
        event_type: "business_application_submitted",
      });
      if (notificationError) {
        console.error("Business application was saved but its Super Admin notification failed:", notificationError.message);
        notificationFailed = true;
      }
    } catch (notificationError) {
      console.error("Business application was saved but the Super Admin notification service is unavailable:", notificationError);
      notificationFailed = true;
    }
    if (notificationFailed) {
      return <RegistrationResult message="Codsigaaga waa la kaydiyey, laakiin ogeysiiska Super Admin lama diri karin. Admin-ku weli wuxuu codsiga ka arki karaa Business applications." />;
    }
  }

  redirect("/app/approval-pending");
}

function RegistrationLoading() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-live="polite">
        <div className="auth-kicker">BUSINESS APPLICATION</div>
        <h1>Codsiga waa la hubinayaa.</h1>
        <p className="auth-description">Sug inta xogta codsigaaga la xaqiijinayo.</p>
      </section>
    </main>
  );
}

function applicationInsertMessage(error: { code: string; message: string }) {
  const { code, message } = error;
  if (code === "42703" && message.includes("platform_audit_logs") && message.includes("actor_id")) {
    return "Database-ka audit log-ga ayaa ka maqan actor_id. Maamulaha Supabase ha ku socodsiiyo faylka supabase/fix-platform-audit-actor-id.sql, kadibna mar kale isku day.";
  }
  if (code === "23502" && message.includes("platform_audit_logs") && message.includes("actor_user_id")) {
    return "Database-ka wali ma dabaqin hagaajinta audit log-ga. Ku socodsii dhammaan SQL-ka ku jira supabase/fix-platform-audit-actor-id.sql gudaha Supabase SQL Editor, hubi inuu ku dhammaaday 'Success. No rows returned', kadibna mar kale isku day.";
  }
  if (code === "23502") {
    return "Xog muhiim ah ayaa ka maqan codsiga. Dib uga bilow diiwaangelinta oo buuxi dhammaan xogta, gaar ahaan telefoonka.";
  }
  if (code === "42501") {
    return "Database-ka ayaa diiday kaydinta codsiga (ogolaanshaha RLS). Super Admin ama maamulaha Supabase ha hubiyo policy-ga INSERT ee business_applications.";
  }
  if (code === "23514") {
    return `Xogta codsiga lama jaanqaadin xeerarka database-ka: ${message}`;
  }
  if (code === "42703" || code === "42P01" || code === "PGRST204" || code === "PGRST205") {
    return `Schema-ga Supabase wuu ka duwan yahay app-ka: ${message}`;
  }
  return `Codsiga lama kaydin (qalad ${code}): ${message}`;
}

function RegistrationResult({ message }: { message: string }) {
  return (
    <main className="auth-page">
      <section className="auth-card"><div className="auth-kicker">BUSINESS APPLICATION</div><h1>Codsiga lama dhamaystirin.</h1><p className="auth-description">{message}</p><Link className="button button-dark auth-submit" href="/app/register/complete">Mar kale isku day →</Link></section>
    </main>
  );
}
