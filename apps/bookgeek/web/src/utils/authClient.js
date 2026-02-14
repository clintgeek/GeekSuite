const BASEGEEK_URL = "https://basegeek.clintgeek.com";
const BROADCAST_CHANNEL = "geeksuite-auth";
const LOGOUT_EVENT_TYPE = "LOGOUT";
const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes

let refreshTimerId = null;

function getApiBase() {
  if (typeof window === "undefined") return "http://localhost:1800/api";

  const hostname = window.location.hostname;
  const origin = window.location.origin.replace(/\/$/, "");

  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return `${origin}/api`;
  }

  return "http://localhost:1800/api";
}

function broadcastLogout() {
  try {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL);
    bc.postMessage({ type: LOGOUT_EVENT_TYPE });
    bc.close();
  } catch {}
}

export function onLogout(callback) {
  try {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL);
    const handler = (event) => {
      if (event?.data?.type === LOGOUT_EVENT_TYPE) {
        callback?.();
      }
    };
    bc.addEventListener("message", handler);
    return () => {
      try {
        bc.removeEventListener("message", handler);
        bc.close();
      } catch {}
    };
  } catch {
    return () => {};
  }
}

export async function getMe() {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/me`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (res.status === 401) return null;

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    const message = json?.error?.message || json?.message || "Failed to load session";
    throw new Error(message);
  }

  return json?.data?.user || null;
}

export function loginRedirect(returnTo, mode = "login") {
  const redirect = encodeURIComponent(returnTo || window.location.href);
  const path = mode === "register" ? "register" : "login";
  window.location.assign(`${BASEGEEK_URL}/${path}?app=bookgeek&redirect=${redirect}`);
}

export async function logout() {
  const apiBase = getApiBase();

  try {
    await fetch(`${apiBase}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {}

  broadcastLogout();
}

export function startRefreshTimer(onFailure) {
  stopRefreshTimer();
  const apiBase = getApiBase();
  async function doRefresh() {
    try {
      const res = await fetch(`${apiBase}/auth/refresh`, {
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
