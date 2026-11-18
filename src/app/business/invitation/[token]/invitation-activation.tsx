"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import PortalSplashScreen from "@/components/auth/portal-splash-screen";
import { createClient } from "@/lib/supabase/client";
import { reportBusinessLoginFailure } from "@/lib/auth/report-business-login-failure";

type Invitation = {
  status: "pending" | "accepted" | "expired";
  email?: string;
  businessName?: string;
  businessId?: string;
  expiresAt?: string;
};

export default function InvitationActivation({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/business/invitations/${encodeURIComponent(invitationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as Invitation & { error?: string };
        if (response.status === 401) {
          if (active) setAuthRequired(true);
          return;
        }
        if (response.status === 403) {
          if (active) {
            setAuthRequired(true);
            setError("Akoonka hadda ku jira ma laha martiqaadkan. Ku gal email-ka ganacsiga lagu ansixiyey.");
          }
          return;
        }
        if (response.status === 410) {
          if (active) setInvitation({ status: "expired" });
          return;
        }
        if (!response.ok) throw new Error(result.error ?? "Martiqaadka lama xaqiijin karo.");
        if (result.status === "accepted" && result.businessId) {
          router.replace(`/app/workspace/${result.businessId}`);
          return;
        }
        if (active) {
          setInvitation(result);
          setEmail(result.email ?? "");
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Martiqaadka lama xaqiijin karo.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [invitationId, router]);

  async function signInAndAccept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Geli email-ka iyo password-ka Business-ka.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient("business");
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (loginError) {
        await reportBusinessLoginFailure(email.trim());
        throw new Error("Email-ka ama password-ku waa khaldan yahay.");
      }

      const response = await fetch(`/api/business/invitations/${encodeURIComponent(invitationId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json() as { businessId?: string; error?: string };
      if (!response.ok || !result.businessId) {
        throw new Error(result.error ?? "Martiqaadka lama aqbalin. Hubi in link-gu weli shaqaynayo.");
      }

      router.replace(`/app/workspace/${result.businessId}`);
      router.refresh();
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "Business-ka lama geli karin.");
    } finally {
      setBusy(false);
    }
  }

  const welcome = "Welcome to Your Business Workspace.";

  return (
    <PortalSplashScreen
      portal="business"
      welcome={welcome}
      showSplashTransition
    >
      <section className="portal-invitation-card">
        <div className="auth-icon" aria-hidden="true">⌂</div>
        <div className="auth-kicker">BUSINESS WORKSPACE INVITATION</div>
        {loading ? (
          <>
            <h1>Martiqaadka waa la xaqiijinayaa.</h1>
            <p className="auth-description">Wax yar sug inta email-ka iyo business-ka la hubinayo.</p>
          </>
        ) : authRequired || invitation?.status === "pending" ? (
          <>
            <h1>Business Workspace-ka gal.</h1>
            <p className="auth-description">
              {invitation?.businessName ? (
                <><strong>{invitation.businessName}</strong> · {invitation.email}<br /></>
              ) : null}
              Ku gal akoonkii aad ku diiwaangelisay ganacsiga si aad u furato workspace-ka laguu ansixiyey.
            </p>
            <form className="auth-form" onSubmit={signInAndAccept}>
              <label htmlFor="invitation-email">Business email</label>
              <input
                autoComplete="username"
                id="invitation-email"
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                required
                type="email"
                value={email}
              />
              <label htmlFor="invitation-password">Password</label>
              <input
                autoComplete="current-password"
                id="invitation-password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                required
                type="password"
                value={password}
              />
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button button-dark auth-submit" disabled={busy} type="submit">
                {busy ? "Waa la xaqiijinayaa..." : "Gal Business Workspace"}
              </button>
            </form>
            <Link className="auth-recovery" href="/business/login">Ma illowday password-ka?</Link>
          </>
        ) : invitation?.status === "expired" ? (
          <>
            <h1>Martiqaadku wuu dhacay.</h1>
            <p className="auth-description">Link-ga wuxuu shaqaynayey 24 saacadood. La xiriir Super Admin si link cusub loogu diro.</p>
            <Link className="button button-dark auth-submit" href="/business/login">Business sign in</Link>
          </>
        ) : (
          <>
            <h1>Martiqaadka lama furin.</h1>
            <p className="auth-description" role="alert">{error || "Xogta martiqaadka lama xaqiijin karo. La xiriir Super Admin."}</p>
            <Link className="button button-dark auth-submit" href="/business/login">Business sign in</Link>
          </>
        )}
      </section>
    </PortalSplashScreen>
  );
}
