"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { businessPresenceStorageKey } from "@/components/auth/business-presence-tracker";

export default function BusinessLogoutButton({ businessId }: { businessId: string }) {
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      const sessionId = sessionStorage.getItem(businessPresenceStorageKey(businessId));
      if (sessionId) {
        const response = await fetch("/api/business/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId, sessionId, action: "offline" }),
          keepalive: true,
        });
        if (!response.ok) console.error("Could not mark the business user offline before logout.");
        sessionStorage.removeItem(businessPresenceStorageKey(businessId));
      }
      const { error } = await createClient().auth.signOut();
      if (error) throw new Error(error.message);
      window.location.replace("/app/login");
    } catch (error) {
      window.alert(
        error instanceof Error && error.message
          ? `Ka bixitaanku ma guulaysan: ${error.message}`
          : "Ka bixitaanku ma guulaysan. Mar kale isku day.",
      );
      setBusy(false);
    }
  }

  return <button className="logout-icon" disabled={busy} onClick={logout} title="Ka bax" type="button" aria-label="Ka bax">{busy ? "…" : "↪"}</button>;
}
