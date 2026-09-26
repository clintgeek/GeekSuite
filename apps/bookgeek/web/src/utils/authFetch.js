/**
 * `authFetch` — bookgeek's own REST API (`/api/*`: bytes and long jobs; see
 * apps/bookgeek/DOCS/CONTEXT.md "Which calls go where"). Sends the session
 * cookie; a 401 signs the user out through whatever handler the signed-in
 * shell registered (App.jsx), exactly as the old in-App `authFetch` did.
 */
import { API_BASE } from "./bookDisplay";

let onUnauthorized = null;

/** App registers its sign-out here; returns an unregister function. */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
  return () => {
    if (onUnauthorized === fn) onUnauthorized = null;
  };
}

export function apiUrl(path) {
  return path.startsWith("/") ? `${ API_BASE }${ path }` : `${ API_BASE }/${ path }`;
}

export async function authFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const res = await fetch(apiUrl(path), {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && onUnauthorized) {
    onUnauthorized();
  }

  return res;
}

/**
 * The message out of a failed REST reply. Two shapes reach here: the zod
 * envelope `{ success:false, error:{ message } }` and a route's own
 * `{ error: "<string>" }` / `{ message }`.
 */
export function restErrorMessage(json, fallback) {
  return (
    json?.error?.message ||
    json?.message ||
    (typeof json?.error === "string" ? json.error : null) ||
    fallback
  );
}
