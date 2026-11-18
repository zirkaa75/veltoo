"use client";

import { useEffect } from "react";

export function businessPresenceStorageKey(businessId: string) {
  return `velto-presence:${businessId}`;
}

export default function BusinessPresenceTracker({ businessId }: { businessId: string }) {
  useEffect(() => {
    const storageKey = businessPresenceStorageKey(businessId);
    const sessionId = sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
    sessionStorage.setItem(storageKey, sessionId);
    const endpoint = "/api/business/presence";
    let active = true;

    async function sendPresence(action: "online" | "offline") {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId, sessionId, action }),
          keepalive: action === "offline",
        });
        if (!response.ok && active) {
          console.error("Business workspace presence could not be updated.");
        }
      } catch (error) {
        if (active) console.error("Business workspace presence request failed:", error);
      }
    }

    void sendPresence("online");
    const intervalId = window.setInterval(() => void sendPresence("online"), 30_000);
    const markOffline = () => {
      const body = new Blob(
        [JSON.stringify({ businessId, sessionId, action: "offline" })],
        { type: "application/json" },
      );
      navigator.sendBeacon(endpoint, body);
      sessionStorage.removeItem(storageKey);
    };
    window.addEventListener("pagehide", markOffline);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("pagehide", markOffline);
    };
  }, [businessId]);

  return null;
}
