import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { GET_PUSH_VAPID_KEY } from '../graphql/queries';
import { SAVE_PUSH_SUBSCRIPTION, REMOVE_PUSH_SUBSCRIPTION } from '../graphql/mutations';

/**
 * The VAPID key arrives as base64url text and `pushManager.subscribe` wants raw
 * bytes. Restore the standard-base64 padding and alphabet, then unpack.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/**
 * usePushReminders — the browser half of task reminders.
 *
 * Status is a single word the UI can render directly:
 *   'loading'     — still working out where we stand
 *   'unsupported' — no Push API here, or the server has no VAPID key
 *   'denied'      — the user said no; only browser settings can undo that
 *   'off'         — available, not subscribed
 *   'on'          — subscribed; the scheduler can reach this device
 *
 * The source of truth for 'on' is the live PushSubscription in the browser, not
 * anything we store — a subscription can be revoked out from under the app.
 */
export default function usePushReminders() {
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const { data, loading } = useQuery(GET_PUSH_VAPID_KEY, { fetchPolicy: 'cache-first' });
  const vapidKey = data?.pushVapidKey || null;

  const [saveSubscription] = useMutation(SAVE_PUSH_SUBSCRIPTION);
  const [removeSubscription] = useMutation(REMOVE_PUSH_SUBSCRIPTION);

  // Settle the initial status once the key query resolves.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (loading) return;
      if (!supported() || !vapidKey) {
        if (!cancelled) setStatus('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setStatus('denied');
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setStatus(existing ? 'on' : 'off');
      } catch {
        if (!cancelled) setStatus('off');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, vapidKey]);

  const enable = useCallback(async () => {
    if (!supported() || !vapidKey) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      // Re-use the existing subscription when there is one: subscribing twice
      // with the same key returns the same endpoint anyway.
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        }));

      const json = subscription.toJSON();
      await saveSubscription({
        variables: {
          input: {
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
            userAgent: navigator.userAgent?.slice(0, 200) || null,
          },
        },
      });
      setStatus('on');
    } catch (err) {
      setError(err);
      setStatus(Notification.permission === 'denied' ? 'denied' : 'off');
    } finally {
      setBusy(false);
    }
  }, [vapidKey, saveSubscription]);

  const disable = useCallback(async () => {
    if (!supported()) return;
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // Drop the server row first: an unsubscribe that succeeds locally and
        // fails remotely would leave the scheduler pushing into the void.
        await removeSubscription({ variables: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setStatus('off');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }, [removeSubscription]);

  const toggle = useCallback(
    () => (status === 'on' ? disable() : enable()),
    [status, disable, enable]
  );

  return { status, busy, error, enable, disable, toggle };
}
