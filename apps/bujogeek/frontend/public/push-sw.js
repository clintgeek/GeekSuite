/* eslint-env serviceworker */
/**
 * push-sw.js — the reminder half of BuJoGeek's service worker.
 *
 * This file is NOT the service worker. VitePWA generates sw.js with workbox
 * (precaching, runtime caching, auto-update) and pulls this in at the top via
 * workbox's `importScripts` option — see vite.config.js. Keeping the handlers
 * here means the generated worker stays generated and we never hand-maintain a
 * precache manifest.
 *
 * The payload is whatever reminderService.buildPayload produced:
 *   { title, body, tags, dueDate, taskId, url }
 *
 * The server cannot know the viewer's timezone, so `body` carries a UTC
 * fallback and the local time is rendered here instead.
 */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'BuJoGeek', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'BuJoGeek reminder';

  // Prefer a locally-formatted due time over the server's UTC fallback.
  let body = payload.body || '';
  if (payload.dueDate) {
    const due = new Date(payload.dueDate);
    if (!Number.isNaN(due.getTime())) {
      const time = due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      const tags = (payload.tags || []).map((t) => `#${t}`).join(' ');
      body = [`Due ${time}`, tags].filter(Boolean).join(' · ');
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      // One notification per task: a re-push for the same task replaces rather
      // than stacks.
      tag: payload.taskId ? `bujo-task-${payload.taskId}` : 'bujo-reminder',
      data: { url: payload.url || '/today' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/today';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an already-open BuJoGeek tab in preference to opening another.
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          if ('navigate' in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })
  );
});
