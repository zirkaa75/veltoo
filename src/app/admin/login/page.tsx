"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import PortalSplashScreen from "@/components/auth/portal-splash-screen";
import { createClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const supabase = createClient("admin");
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (loginError || !data.user) {
        setError(
          loginError?.message === "Invalid login credentials"
            ? "Email-ka ama password-ku waa khaldan yahay. Haddii aad illowday password-ka, dooro “Ma illowday password-ka?” si dib loogu dejiyo."
            : loginError?.message ?? "Gelitaanka lama xaqiijin.",
        );
        return;
      }

      const { data: membership, error: membershipError } = await supabase
        .from("platform_admins")
        .select("status, role")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (membershipError) {
        await supabase.auth.signOut();
        setError("Akoonka waa la xaqiijiyey, laakiin Super Admin-ka lagama hubin database-ka. Hubi migration-ka iyo platform_admins.");
        return;
      }

      if (!membership) {
        await supabase.auth.signOut();
        setError("Email-ka iyo password-ku waa sax, laakiin email-kan weli Super Admin looma darin. Ku orod supabase/bootstrap-super-admin.sql gudaha Supabase SQL Editor-ka, kadib mar kale isku day.");
        return;
      }

      if (
        membership.status !== "active"
        || !["platform_administrator", "support_staff"].includes(membership.role)
      ) {
        await supabase.auth.signOut();
        setError("Akoonka wuu jiraa, laakiin ma aha Super Admin ama support agent firfircoon. Hubi role-ka iyo status-ka public.platform_admins, kadib mar kale gal.");
        return;
      }

      window.location.replace(membership.role === "support_staff" ? "/admin/whatsapp-support" : "/admin/dashboard");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Gelitaanka ma suurtagelin.");
    } finally {
      setBusy(false);
    }
  }

  async function sendPasswordReset() {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Marka hore geli email-ka Super Admin.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const supabase = createClient("admin");
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", "/admin/set-password");
      redirectTo.searchParams.set("portal", "admin");
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: redirectTo.toString(),
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setNotice("Haddii email-kan ku jiro Super Admin account, link dib-u-dejin ah ayaa loo diray. Hubi inbox-ka iyo spam-ka.");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Link-ga dib-u-dejinta lama diri karin.");
    } finally {
      setBusy(false);
    }
  }

  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return (
    <PortalSplashScreen
      portal="admin"
      welcome="Welcome Back, Super Admin."
      showSplashTransition
    >
      <div className="auth-decoration auth-decoration-one" />
      <div className="auth-decoration auth-decoration-two" />
      <div className="admin-auth-shell">
        <aside className="admin-auth-panel">
          <div>
            <span className="admin-auth-panel-label">VELTO · ADMIN SUPPORT</span>
            <h2>Maamulka<br />platform-ka.</h2>
            <p>Maamul codsiyada, ganacsiyada, rukhsadaha iyo xogta adeegyada VELTO hal meel oo ammaan ah.</p>
          </div>
          <div className="admin-auth-features">
            <div className="admin-auth-feature"><span>✓</span> Kaliya akoonnada maamulka la xaqiijiyey</div>
            <div className="admin-auth-feature"><span>✓</span> Maamul heer-platform ah</div>
            <div className="admin-auth-feature"><span>✓</span> Xogta gaarka ah ee business-yadu way gooni tahay</div>
          </div>
        </aside>
        <section className="auth-card admin-auth-card">
        <div className="auth-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 3.5 19 6v5.6c0 4.5-2.9 7.7-7 9.4-4.1-1.7-7-4.9-7-9.4V6l7-2.5Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <div className="auth-kicker">VELTO PLATFORM</div>
        <h1>Ku soo dhowow.</h1>
        <p className="auth-description">Super Admin ama support agent firfircoon ayaa geli kara.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Admin email</label>
          <input
            autoComplete="username"
            id="email"
            name="email"
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
              setNotice("");
            }}
            placeholder="admin@example.com"
            required
            type="email"
            value={email}
          />
          <label htmlFor="password">Password</label>
          <input
            autoComplete="current-password"
            id="password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Geli password-ka"
            required
            type="password"
            value={password}
          />
          <button
            className="auth-recovery"
            disabled={busy || !supabaseConfigured}
            onClick={sendPasswordReset}
            type="button"
          >
            {busy ? "Sug..." : "Ma illowday password-ka?"}
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="workspace-notice" role="status">{notice}</p>}
          {!supabaseConfigured && <p className="form-error" role="alert">Supabase lama dejin. Deji NEXT_PUBLIC_SUPABASE_URL iyo NEXT_PUBLIC_SUPABASE_ANON_KEY.</p>}
          <button className="button button-dark auth-submit" disabled={busy || !supabaseConfigured} type="submit">
            {busy ? "Waa la xaqiijinayaa..." : "Gal maamulka"} <span aria-hidden="true">→</span>
          </button>
        </form>

        <div className="demo-hint"><span className="demo-hint-icon" aria-hidden="true">i</span><span>Super Admin waxaa sameeya oo xaqiijiya maamulaha database-ka. Public registration ma laha doorar Admin.</span></div>
        </section>
      </div>
    </PortalSplashScreen>
  );
}
