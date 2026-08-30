import Task from '../models/Task.js';
import PushSubscription from '../models/PushSubscription.js';
import logger from '../../../lib/logger.js';

/**
 * How far back a tick will reach for a reminder it has not yet sent.
 *
 * Without a cap, a server that has been down for a day would come back up and
 * fire every missed reminder at once. Fifteen minutes is long enough to survive
 * a deploy or a restart and short enough that nothing stale ever arrives — a
 * reminder older than the window is simply never sent, and the task keeps its
 * null `remindedAt` (it is out of the query window, so it costs nothing).
 */
export const MISSED_WINDOW_MS = 15 * 60 * 1000;

/** How often the scheduler sweeps. One minute is the resolution of a reminder. */
export const TICK_INTERVAL_MS = 60 * 1000;

/** Notification titles are truncated to this before the OS does it for us. */
const TITLE_MAX = 80;

/**
 * A dueDate at *exactly* UTC midnight is the module's "date only, no time"
 * convention (the same one habitService.toUtcMidnight writes). Such a task is
 * due on a day, not at a moment, so it never generates a reminder — there is no
 * defensible instant to fire at.
 *
 * Anything else carries a real due time and is reminder-eligible.
 */
export function hasDueTime(dueDate) {
  if (!dueDate) return false;
  const d = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getUTCHours() !== 0 ||
    d.getUTCMinutes() !== 0 ||
    d.getUTCSeconds() !== 0 ||
    d.getUTCMilliseconds() !== 0
  );
}

/**
 * ReminderService — web-push reminders for tasks that carry a due *time*.
 *
 * Two halves:
 *   - Subscription bookkeeping (owner-scoped, same `requireUser` discipline as
 *     every other service in this module).
 *   - A 60-second scheduler that sweeps for tasks whose moment has arrived and
 *     pushes to every device its owner has registered.
 *
 * The push transport is injectable (`setTransport`) so tests never touch the
 * network; in production it is the `web-push` package, configured once from
 * VAPID_* env on first use.
 */
class ReminderService {
  constructor() {
    this.taskModel = Task;
    this.subscriptionModel = PushSubscription;
    this.transport = null;
    this.transportReady = false;
    this.timer = null;
    this.ticking = false;
  }

  requireUser(userId) {
    if (!userId) {
      const err = new Error('Unauthorized');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    return userId;
  }

  // ── VAPID / transport ──────────────────────────────────────────────────────

  vapidPublicKey() {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  /** True when both halves of the VAPID key pair are present. */
  isConfigured() {
    return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  }

  /** Tests hand in a stub with `sendNotification`; production gets `web-push`. */
  setTransport(transport) {
    this.transport = transport;
    this.transportReady = true;
  }

  async getTransport() {
    if (this.transportReady) return this.transport;
    const webpush = (await import('web-push')).default;
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@clintgeek.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    this.transport = webpush;
    this.transportReady = true;
    return this.transport;
  }

  // ── Subscriptions (owner-scoped) ───────────────────────────────────────────

  /**
   * Upsert by endpoint. A browser that re-subscribes hands back the same
   * endpoint, so this is idempotent per device; re-claiming an endpoint also
   * re-stamps `createdBy`, which is what makes a shared device work.
   */
  async saveSubscription(input, userId) {
    this.requireUser(userId);
    const endpoint = input?.endpoint;
    const p256dh = input?.keys?.p256dh;
    const auth = input?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      throw new Error('A push subscription needs an endpoint and both keys');
    }
    return this.subscriptionModel.findOneAndUpdate(
      { endpoint },
      {
        endpoint,
        createdBy: userId,
        keys: { p256dh, auth },
        userAgent: input.userAgent || null,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  /** Removing somebody else's endpoint is indistinguishable from a no-op. */
  async removeSubscription(endpoint, userId) {
    this.requireUser(userId);
    if (!endpoint) return false;
    const res = await this.subscriptionModel.deleteOne({ endpoint, createdBy: userId });
    return res.deletedCount > 0;
  }

  async listSubscriptions(userId) {
    this.requireUser(userId);
    return this.subscriptionModel.find({ createdBy: userId }).sort({ createdAt: -1 });
  }

  // ── Notification shape ─────────────────────────────────────────────────────

  /**
   * The payload the service worker receives.
   *
   * `body` is a *fallback*: the server cannot know the viewer's timezone, so it
   * renders the due time in UTC and the service worker re-renders it in local
   * time from `dueDate`. Keeping both means a notification is still readable if
   * the SW handler is an older version.
   */
  buildPayload(task) {
    const title = String(task.content || 'Reminder').slice(0, TITLE_MAX);
    const due = new Date(task.dueDate);
    const hh = String(due.getUTCHours()).padStart(2, '0');
    const mm = String(due.getUTCMinutes()).padStart(2, '0');
    const tags = (task.tags || []).filter(Boolean).map((t) => `#${t}`).join(' ');
    const body = [`Due ${hh}:${mm} UTC`, tags].filter(Boolean).join(' · ');
    return {
      title,
      body,
      tags: (task.tags || []).filter(Boolean),
      dueDate: due.toISOString(),
      taskId: String(task._id),
      url: '/today',
    };
  }

  /**
   * Push one payload to one subscription.
   *
   * A 404 or 410 from the push service means the endpoint is permanently gone
   * (browser uninstalled, permission revoked, subscription rotated) — the row
   * is deleted rather than retried. Every other failure is logged and left
   * alone, because it may well be transient.
   */
  async pushTo(subscription, payload) {
    const transport = await this.getTransport();
    try {
      await transport.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        },
        JSON.stringify(payload)
      );
      return 'sent';
    } catch (err) {
      const status = err?.statusCode ?? err?.status;
      if (status === 404 || status === 410) {
        await this.subscriptionModel.deleteOne({ endpoint: subscription.endpoint });
        return 'pruned';
      }
      logger.warn({ err, endpoint: subscription.endpoint }, '[BujoReminders] push failed');
      return 'failed';
    }
  }

  // ── The sweep ──────────────────────────────────────────────────────────────

  /**
   * One pass. Finds every pending, not-yet-reminded task whose due *time* has
   * arrived inside the missed-reminder window and pushes it to its owner's
   * devices.
   *
   * `remindedAt` is stamped whether or not any device accepted the push: a
   * reminder is fired once, and a user with no working subscription is a user
   * with no reminders, not a user with a backlog of them.
   */
  async tick(now = new Date()) {
    const upper = now instanceof Date ? now : new Date(now);
    const lower = new Date(upper.getTime() - MISSED_WINDOW_MS);

    const candidates = await this.taskModel.find({
      status: 'pending',
      remindedAt: null,
      dueDate: { $gt: lower, $lte: upper },
    });

    // A UTC-midnight dueDate is a calendar date, not a moment — skip it.
    const due = candidates.filter((task) => hasDueTime(task.dueDate));
    const summary = { considered: due.length, sent: 0, pruned: 0, failed: 0 };
    if (!due.length) return summary;

    // One subscription read per owner per tick, not per task.
    const subsByUser = new Map();
    const subsFor = async (userId) => {
      const key = String(userId);
      if (!subsByUser.has(key)) {
        subsByUser.set(key, await this.subscriptionModel.find({ createdBy: userId }));
      }
      return subsByUser.get(key);
    };

    for (const task of due) {
      const payload = this.buildPayload(task);
      const subs = await subsFor(task.createdBy);
      for (const sub of subs) {
        const result = await this.pushTo(sub, payload);
        if (result === 'sent') summary.sent += 1;
        else if (result === 'pruned') summary.pruned += 1;
        else summary.failed += 1;
      }
      await this.taskModel.updateOne({ _id: task._id }, { $set: { remindedAt: upper } });
    }

    return summary;
  }

  // ── Scheduler ──────────────────────────────────────────────────────────────

  /**
   * Start the 60-second sweep. A no-op (with one log line) when VAPID is not
   * configured, so a dev box without keys boots silently-correct rather than
   * throwing on every tick.
   */
  start({ intervalMs = TICK_INTERVAL_MS } = {}) {
    if (this.timer) return false;
    if (!this.isConfigured()) {
      logger.info('[BujoReminders] VAPID keys not configured — reminder scheduler disabled');
      return false;
    }
    logger.info(`[BujoReminders] scheduler started (every ${intervalMs}ms)`);
    this.timer = setInterval(() => {
      // Overlap guard: a slow tick must never stack on the next one, or the
      // same task could be picked up twice before remindedAt lands.
      if (this.ticking) return;
      this.ticking = true;
      this.tick()
        .then((summary) => {
          if (summary.sent || summary.pruned || summary.failed) {
            logger.info({ summary }, '[BujoReminders] tick');
          }
        })
        .catch((err) => logger.error({ err }, '[BujoReminders] tick failed'))
        .finally(() => {
          this.ticking = false;
        });
    }, intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    return true;
  }

  stop() {
    if (!this.timer) return false;
    clearInterval(this.timer);
    this.timer = null;
    this.ticking = false;
    logger.info('[BujoReminders] scheduler stopped');
    return true;
  }
}

const reminderService = new ReminderService();
export default reminderService;
