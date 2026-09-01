/* Study Up service worker — Web Push only (no offline caching).
 *
 * Payload shape sent from src/lib/push.ts:
 *   { title: string, body: string, url?: string, tag?: string }
 */

self.addEventListener("push", function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Study Up", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Study Up";
  const options = {
    body: data.body || "",
    tag: data.tag || undefined, // same tag => notifications collapse instead of stacking
    renotify: Boolean(data.tag),
    data: { url: data.url || "/" },
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      // Focus an existing tab on the same origin and navigate it.
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            try {
              client.navigate(targetUrl);
            } catch {
              /* cross-origin or unsupported — ignore */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
