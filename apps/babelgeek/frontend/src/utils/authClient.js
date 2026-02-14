const BASEGEEK_URL = import.meta.env.VITE_BASEGEEK_URL || "https://basegeek.clintgeek.com";
const BROADCAST_CHANNEL = "geeksuite-auth";
const LOGOUT_EVENT_TYPE = "LOGOUT";
const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes

let refreshTimerId = null;

export async function getMe() {
  const res = await fetch("/api/me", {
    credentials: "include",
    cache: "no-store",
  });

  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to fetch session");

  const data = await res.json().catch(() => ({}));
  return data?.data?.user || data?.user || null;
}

function sanitizeRedirectTarget(target) {
  try {
    const url = new URL(target);
    const p = url.pathname || "/";
    if (p === "/login" || p === "/register") {
      return url.origin + "/";
    }
    return url.toString();
  } catch {
    return window.location.origin + "/";
  }
}

export function loginRedirect(returnTo = window.location.href, mode = "login") {
  const path = mode === "register" ? "/register" : "/login";
  const url = new URL(`${BASEGEEK_URL}${path}`);
  url.searchParams.set("app", "babelgeek");
  url.searchParams.set("redirect", sanitizeRedirectTarget(returnTo));
  window.location.href = url.toString();
}

export async function logout() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    broadcastLogout();
  }
}

export function onLogout(callback) {
  if (typeof window === "undefined" || !window.BroadcastChannel) {
    return () => {};
  }
  const channel = new BroadcastChannel(BROADCAST_CHANNEL);
  channel.onmessage = (event) => {
    if (event.data?.type === LOGOUT_EVENT_TYPE) {
      callback();
    }
  };
  return () => { channel.close(); };
}

function broadcastLogout() {
  if (typeof window === "undefined" || !window.BroadcastChannel) return;
  const channel = new BroadcastChannel(BROADCAST_CHANNEL);
  channel.postMessage({ type: LOGOUT_EVENT_TYPE });
  channel.close();
}

export function startRefreshTimer(onFailure) {
  stopRefreshTimer();
  async function doRefresh() {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.status === 401 || res.status === 403) {
        stopRefreshTimer();
        if (onFailure) onFailure();
      }
    } catch {}
  }
  doRefresh();
  refreshTimerId = setInterval(doRefresh, REFRESH_INTERVAL_MS);
}

export function stopRefreshTimer() {
  if (refreshTimerId !== null) {
    clearInterval(refreshTimerId);
    refreshTimerId = null;
  }
}
