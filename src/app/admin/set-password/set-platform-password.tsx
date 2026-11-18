"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SetPlatformPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 12) {
      setError("Password-ku waa inuu ka koobnaadaa ugu yaraan 12 xaraf.");
      return;
    }
    if (password !== confirmation) {
      setError("Labada password isma laha.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient("admin");
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError("Martiqaadka lama xaqiijin. Ka fur link-ga email-kaaga mar kale.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.replace("/admin/dashboard");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Password-ka lama dejin.");
    } finally {
      setBusy(false);
    }
  }

  return (
      <>
        <div className="auth-kicker">SUPER ADMIN ACCOUNT</div>
        <h1>Deji password ammaan ah.</h1>
        <p className="auth-description">Deji ama cusboonaysii password-ka akoonka maamulka platform-ka.</p>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="admin-new-password">Password cusub</label>
          <input autoComplete="new-password" id="admin-new-password" minLength={12} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          <label htmlFor="admin-confirm-password">Xaqiiji password-ka</label>
          <input autoComplete="new-password" id="admin-confirm-password" onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-dark auth-submit" disabled={busy} type="submit">{busy ? "Waa la kaydinayaa..." : "Password-ka kaydi"} <span>→</span></button>
        </form>
      </>
  );
}
