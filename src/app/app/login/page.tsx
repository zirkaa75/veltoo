"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import PortalSplashScreen from "@/components/auth/portal-splash-screen";
import { createClient } from "@/lib/supabase/client";
import { reportBusinessLoginFailure } from "@/lib/auth/report-business-login-failure";

export default function BusinessLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const supabase = createClient();
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError || !data.user) {
        if (loginError) await reportBusinessLoginFailure(email.trim());
        setError(
          loginError?.message === "Invalid login credentials"
            ? "Email-ka ama password-ku sax ma aha. Haddii aad hadda isdiiwaangelisay, marka hore xaqiiji email-kaaga."
            : loginError?.message ?? "Gelitaanka lama xaqiijin.",
        );
        return;
      }

      const { data: admin, error: adminError } = await supabase
        .from("platform_admins")
        .select("status, role")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (adminError) {
        await supabase.auth.signOut();
        setError("Akoonka lama xaqiijin. Mar kale isku day.");
        return;
      }
      if (admin?.status === "active" && admin.role === "platform_administrator") {
        await supabase.auth.signOut();
        setError("Akoonkan waa Super Admin. Isticmaal Super Admin login.");
        return;
      }

      const { data: membership, error: membershipError } = await supabase
        .from("business_users")
        .select("business_id")
        .eq("user_id", data.user.id)
        .eq("status", "active")
        .limit(2);
      if (membershipError) {
        await supabase.auth.signOut();
        setError(`Xaqiijinta workspace-ka way fashilantay: ${membershipError.message}`);
        return;
      }

      if (!membership.length) {
        const { data: application, error: applicationError } = await supabase
          .from("business_applications")
          .select("id")
          .eq("owner_user_id", data.user.id)
          .maybeSingle();

        if (applicationError) {
          setError(`Codsiga ganacsiga lama hubin karin: ${applicationError.message}`);
          return;
        }
        if (application) {
          router.replace("/app/approval-pending");
          return;
        }
        if (typeof data.user.user_metadata.pending_business_name === "string") {
          router.replace("/app/register/complete");
          return;
        }

        await supabase.auth.signOut();
        setError("Akoonkan weli ma laha workspace ganacsi ama codsi sugaya ansixin.");
        return;
      }

      router.replace(
        membership.length > 1
          ? "/app/select-business"
          : `/app/workspace/${membership[0].business_id}`,
      );
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Gelitaanka ma suurtagelin.");
    } finally {
      setBusy(false);
    }
  }

  async function sendPasswordReset() {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Marka hore geli email-ka business-ka.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const supabase = createClient("business");
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", "/business/set-password");
      redirectTo.searchParams.set("portal", "business");
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: redirectTo.toString(),
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setNotice("Haddii email-ku leeyahay akoon VELTO, link dib-u-dejin ah ayaa loo diray.");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Link-ga dib-u-dejinta lama diri karin.");
    } finally {
      setBusy(false);
    }
  }

  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return (
    <PortalSplashScreen
      portal="business"
      welcome="Welcome to Your Business Workspace."
      showSplashTransition
    >
      <div className="business-auth-shell">
        <aside className="business-auth-panel">
          <div>
            <span className="business-auth-panel-label">VELTO · BUSINESS WORKSPACE</span>
            <h2>Ganacsigaaga,<br />hal meel.</h2>
            <p>Maamul alaabta, iibka, macaamiisha iyo laamaha ganacsigaaga adigoo ku jira workspace ammaan ah.</p>
          </div>
          <div className="business-auth-features">
            <div className="business-auth-feature"><span>✓</span> Xog u gaar ah business-kaaga</div>
            <div className="business-auth-feature"><span>✓</span> Shaqooyinka iyo rukhsadaha kooxda</div>
            <div className="business-auth-feature"><span>✓</span> Tirakoobyo ka yimaada xogta dhabta ah</div>
          </div>
        </aside>
        <section className="auth-card business-auth-card">
          <div className="auth-icon" aria-hidden="true">⌂</div>
          <div className="auth-kicker">BUSINESS WORKSPACE</div>
          <h1>Ganacsigaaga gal.</h1>
          <p className="auth-description">Business user-ku wuxuu geli karaa workspace-ka ganacsigiisa oo keliya.</p>
          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="business-email">Email</label>
            <input autoComplete="username" id="business-email" onChange={(event) => setEmail(event.target.value)} placeholder="magac@email.com" required type="email" value={email} />
            <label htmlFor="business-password">Password</label>
            <input autoComplete="current-password" id="business-password" onChange={(event) => setPassword(event.target.value)} placeholder="Password-kaaga" required type="password" value={password} />
            <button className="auth-recovery" disabled={busy || !configured} onClick={sendPasswordReset} type="button">
              {busy ? "Sug..." : "Ma illowday password-ka?"}
            </button>
            {error && <p className="form-error" role="alert">{error}</p>}
            {notice && <p className="workspace-notice" role="status">{notice}</p>}
            {!configured && <p className="form-error" role="alert">Supabase lama dejin. Deji environment variables-ka.</p>}
            <button className="button button-dark auth-submit" disabled={busy || !configured} type="submit">{busy ? "Waa la xaqiijinayaa..." : "Ganacsiga gal"} <span>→</span></button>
          </form>
          <div className="demo-hint"><span className="demo-hint-icon">i</span><span>Gelitaanka iyo business membership-ka server-ka ayaa hubiya.</span></div>
        </section>
      </div>
    </PortalSplashScreen>
  );
}
