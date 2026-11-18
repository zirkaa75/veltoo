self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "VELTO", {
      body: payload.body || "Wax cusub ayaa ka dhacay VELTO.",
      icon: "/velto-icon.svg",
      badge: "/velto-icon.svg",
      data: { url: payload.url || "/admin/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/admin/notifications", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url === url);
      return existing ? existing.focus() : self.clients.openWindow(url);
    }),
  );
});
