function getApiBase() {
  const envBase = import.meta.env.VITE_API_URL;
  if (envBase) return String(envBase).replace(/\/$/, "");

  if (typeof window === "undefined") return "http://localhost:3001/api";

  const hostname = window.location.hostname;
  const origin = window.location.origin.replace(/\/$/, "");
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return `${origin}/api`;
  }

  return "http://localhost:3001/api";
}

const LOGOUT_CHANNEL = "geeksuite-auth";
const LOGOUT_EVENT_TYPE = "LOGOUT";
const REFRESH_INTERVAL_MS = 50 * 60 * 1000;

let refreshTimerId = null;

export async function getMe() {
  const API_BASE = getApiBase();
  const res = await fetch(`${API_BASE}/me`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (res.status === 401) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Failed to load session (${res.status})`);
  }

  const json = await res.json().catch(() => null);
  return json?.data?.user || json?.user || null;
}

export function loginRedirect(returnTo = null, mode = "login") {
  if (typeof window === "undefined") return;
  const to = returnTo || window.location.href;
  const baseGeekUrl =
    import.meta.env.VITE_BASE_GEEK_URL ||
    import.meta.env.VITE_BASEGEEK_URL ||
    "https://basegeek.clintgeek.com";
  const path = mode === "register" ? "/register" : "/login";

  const redirectParam = encodeURIComponent(to);
  window.location.assign(`${baseGeekUrl}${path}?app=bujogeek&redirect=${redirectParam}`);
}

export async function logout() {
  const API_BASE = getApiBase();
  await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => {});

  try {
    const bc = new BroadcastChannel(LOGOUT_CHANNEL);
    bc.postMessage({ type: LOGOUT_EVENT_TYPE });
    bc.close();
  } catch {
    // ignore
  }
}

export function onLogout(handler) {
  let bc;
  try {
    bc = new BroadcastChannel(LOGOUT_CHANNEL);
  } catch {
    return () => {};
  }

  const listener = (event) => {
    if (event?.data?.type === LOGOUT_EVENT_TYPE) {
      handler();
    }
  };

  bc.addEventListener("message", listener);

  return () => {
    bc.removeEventListener("message", listener);
    bc.close();
  };
}

export function startRefreshTimer(onFailure) {
  stopRefreshTimer();
  const API_BASE = getApiBase();
  async function doRefresh() {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
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
