# Reminders (web push)

A dated task with a **time** pushes a notification at that time. That is the
whole feature.

## The no-time-no-reminder rule

BuJoGeek's date convention is that a `dueDate` at **exactly UTC midnight** means
"this day", with no time of day attached — it is a calendar date, and the app
renders it as `today` / `tomorrow` / `Mar 14` rather than a clock time. Any other
instant carries a real due time.

Reminders follow that convention exactly:

| `dueDate`                  | Meaning        | Reminder |
| -------------------------- | -------------- | -------- |
| `null`                     | undated        | no       |
| `2026-03-15T00:00:00.000Z` | date only      | no       |
| `2026-03-15T14:30:00.000Z` | due at 14:30   | yes      |

The test is `hasDueTime()` in `reminderService.js`. There is deliberately no way
to ask for a reminder on a date-only task: there would be no defensible instant
to fire at.

## Where the scheduler lives

In **basegeek**, not in the browser. basegeek owns the task data and runs 24/7;
a client-side timer would only fire while the app happened to be open.

- `apps/basegeek/packages/api/src/graphql/bujogeek/services/reminderService.js`
- Started from `src/server.js` next to the OAuth refresh job, stopped in the
  graceful-shutdown path.

Each tick (every 60 seconds):

1. Find tasks that are `status: 'pending'`, `remindedAt: null`, and whose
   `dueDate` falls in `(now - 15 minutes, now]`.
2. Drop any whose `dueDate` is UTC midnight (see above).
3. Push to every `PushSubscription` belonging to the task's `createdBy`.
4. Stamp `remindedAt` — **whether or not any push succeeded**. A reminder fires
   once; a user with no working device is a user with no reminders, not a user
   accumulating a backlog of them.

Two safety properties worth knowing:

- **The 15-minute cap.** A reminder older than the window is never sent. A
  server that was down overnight comes back up quiet instead of firing a day of
  missed reminders at once.
- **`remindedAt` is cleared when `dueDate` moves.** `taskService.updateTask`
  clears it whenever the incoming `dueDate` differs from the stored one, so
  rescheduling a task genuinely re-arms its reminder. Editing anything else
  leaves it alone.

A push service answering **404** or **410 Gone** means the endpoint is dead for
good; that subscription row is deleted rather than retried. This is the only
garbage collection the collection gets.

## Generating VAPID keys

Once per deployment:

```sh
npx web-push generate-vapid-keys
```

Put the pair in basegeek's environment (see `apps/basegeek/.env.example`):

```
VAPID_PUBLIC_KEY=BE...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
```

Restart basegeek. On boot you get exactly one of two log lines:

```
[BujoReminders] scheduler started (every 60000ms)
[BujoReminders] VAPID keys not configured — reminder scheduler disabled
```

With no keys the feature is simply absent: `pushVapidKey` resolves to `null` and
the client hides the toggle. Nothing errors.

**Rotating the keys invalidates every existing subscription.** Browsers are
subscribed against a specific public key; change it and every device has to
re-subscribe. Treat the pair as permanent unless it leaks.

## The browser half

- `public/push-sw.js` holds the `push` and `notificationclick` handlers. It is
  *not* the service worker — VitePWA still generates `sw.js` with workbox
  (`generateSW`), and pulls this file in via workbox's `importScripts` option in
  `vite.config.js`. That keeps precaching generated rather than hand-maintained.
- `src/hooks/usePushReminders.js` asks for permission, subscribes through
  `pushManager`, and saves the subscription via GraphQL. Its `status` is one of
  `loading` / `unsupported` / `denied` / `off` / `on`, read from the live browser
  subscription rather than from anything we store.
- The toggle is the bell row in the sidebar footer, above **Sign out**. It hides
  itself entirely when the browser has no Push API or the server has no key.

The server cannot know the viewer's timezone, so the notification body it sends
renders the due time in UTC as a fallback; the service worker re-renders it in
local time from the `dueDate` in the payload.

## GraphQL surface

```graphql
query   { pushVapidKey }                       # null when unconfigured
query   { pushSubscriptions { id endpoint } }  # the caller's devices
mutation { savePushSubscription(input: PushSubscriptionInput!) }
mutation { removePushSubscription(endpoint: String!) }
```

All four are owner-scoped and require auth. Subscriptions are keyed by endpoint,
so re-registering the same browser updates the row instead of duplicating it.

## Tests

`apps/basegeek/packages/api/src/__tests__/bujogeekReminders.test.js` — run with:

```sh
cd apps/basegeek/packages/api
node --experimental-vm-modules node_modules/jest/bin/jest.js bujogeek --runInBand
```

The push transport is injected (`reminderService.setTransport`), so nothing in
the suite touches the network or needs real VAPID keys.
