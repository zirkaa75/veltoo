"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function CompleteRegistrationPhone() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        data: { pending_business_phone: phone.trim() },
      });
      if (updateError) {
        setError(`Telefoonka lama kaydin: ${updateError.message}`);
        return;
      }
      router.refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Telefoonka lama kaydin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-kicker">BUSINESS APPLICATION</div>
        <h1>Dhammaystir codsigaaga.</h1>
        <p className="auth-description">Geli telefoonka ganacsiga si codsigaaga loo kaydiyo.</p>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="pending-business-phone">Telefoonka ganacsiga</label>
          <input
            autoComplete="tel"
            id="pending-business-phone"
            onChange={(event) => setPhone(event.target.value)}
            required
            type="tel"
            value={phone}
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-dark auth-submit" disabled={busy} type="submit">
            {busy ? "Waa la kaydinayaa..." : "Sii wad"} <span aria-hidden="true">→</span>
          </button>
        </form>
      </section>
    </main>
  );
}
