"use client";

import { useEffect, useState } from "react";

type PushSubscriptionResponse = {
  publicKey?: string | null;
  configured?: boolean;
  error?: string;
};

function decodePublicKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export default function AdminPushControls() {
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistration("/")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => {
        if (active) setEnabled(Boolean(subscription));
      })
      .catch((error: unknown) => {
        if (active) console.error("Could not check the current browser push subscription:", error);
      });
    return () => { active = false; };
  }, []);

  async function enableNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setMessage("Browser-kan ma taageero browser push notifications.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const settingsResponse = await fetch("/api/admin/push-subscriptions", { cache: "no-store" });
      const settings = await settingsResponse.json() as PushSubscriptionResponse;
      if (!settingsResponse.ok || !settings.configured || !settings.publicKey) {
        throw new Error(settings.error ?? "Web Push VAPID keys lama dejin server-ka.");
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Oggolaanshaha browser notifications lama siin.");
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodePublicKey(settings.publicKey),
        });
      const saveResponse = await fetch("/api/admin/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const result = await saveResponse.json() as { error?: string };
      if (!saveResponse.ok) throw new Error(result.error ?? "Push subscription lama kaydin.");
      setEnabled(true);
      setMessage("Ogeysiisyada browser-ka waa la hawlgeliyey.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Push notifications lama hawlgelin.");
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/admin/push-subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Push subscription lama tirtirin.");
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setMessage("Ogeysiisyada browser-ka waa la damiyey.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Push notifications lama damin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Browser push notifications</h2>
          <p>Ogeysiisyada online/offline iyo isku-dayada login-ka waxay iman karaan desktop-ka ama mobile-ka marka browser-ku taageero.</p>
        </div>
      </header>
      <div className="push-notification-controls">
        <p>Dooro oggolaanshaha browser-ka si Super Admin-ku u helo ogeysiisyo. Password lama diro ama lama kaydiyo.</p>
        <button
          className={enabled ? "button button-outline" : "button button-dark"}
          disabled={busy}
          onClick={enabled ? disableNotifications : enableNotifications}
          type="button"
        >
          {busy ? "Sug..." : enabled ? "Dami ogeysiisyada" : "Hawl geli ogeysiisyada"}
        </button>
        {message && <p className={message.includes("hawlgeliyey") || message.includes("dami") ? "workspace-notice" : "form-error"} role="status">{message}</p>}
      </div>
    </section>
  );
}
