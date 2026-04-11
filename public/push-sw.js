self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();

  const title = payload.title || "The Beacon";
  const body = payload.body || "There is a new urgent update.";
  const href = payload.href || "/notifications";
  const createdAt = payload.createdAt || new Date().toISOString();
  const notificationId = payload.id || (payload.storyId ? `urgent:${payload.storyId}` : `push:${createdAt}`);

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        client.postMessage({
          type: "site-notification",
          notification: {
            id: notificationId,
            type: payload.type || "urgent",
            title,
            body,
            href,
            createdAt,
            read: false,
          },
        });
      }

      await self.registration.showNotification(title, {
        body,
        data: { href },
        badge: "/small logo.png",
        icon: "/small logo.png",
        tag: notificationId,
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/notifications";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            await client.navigate(href);
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(href);
      }
    })()
  );
});
