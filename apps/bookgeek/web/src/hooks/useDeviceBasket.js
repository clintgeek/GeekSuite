/**
 * The device basket (Kindle "Download to device") and the library's select
 * mode that feeds it. Session-level, not per view: the detail sheet's More
 * menu adds to the same basket the library's selection bar posts, and the
 * FAB hides while either is in use — so it lives in the signed-in shell's
 * provider (hooks/useBookGeek.jsx), and survives a trip to Settings.
 *
 * The basket itself is `POST /api/device-baskets` on bookgeek's own API; the
 * Kindle fetches it by secret word at `/download-basket` (see CONTEXT.md).
 */
import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../utils/authFetch";

export const MAX_BASKET_BOOKS = 50;
const BASKET_IDLE_MS = 30 * 60 * 1000;

export function useDeviceBasket() {
  // Library bulk-select ("Select books…" in the filter sheet). It drives
  // `basketBookIds` — the list the device basket posts — and hides the FAB.
  const [selectMode, setSelectMode] = useState(false);
  const [basketBookIds, setBasketBookIds] = useState([]);
  const [basketLoading, setBasketLoading] = useState(false);
  const [basketError, setBasketError] = useState(null);
  const [basketResult, setBasketResult] = useState(null); // { slug, url, expiresAt }
  const [basketResultOpen, setBasketResultOpen] = useState(false);

  // Auto-clear the basket after 30 minutes without any basket interaction
  // (selection changes and basket creation both reset the timer).
  useEffect(() => {
    if (basketBookIds.length === 0) return undefined;
    const timer = setTimeout(() => {
      setBasketBookIds([]);
      setBasketError(null);
      setBasketResult(null);
      setBasketResultOpen(false);
    }, BASKET_IDLE_MS);
    return () => clearTimeout(timer);
  }, [basketBookIds, basketResult]);

  const toggleBasket = useCallback((bookId, event) => {
    if (event && typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
    setBasketBookIds((prev) =>
      prev.includes(bookId) ? prev.filter((id) => id !== bookId) : [...prev, bookId]
    );
    setBasketError(null);
  }, []);

  const clearBasket = useCallback(() => {
    setBasketBookIds([]);
    setBasketError(null);
    setBasketResult(null);
    setBasketResultOpen(false);
  }, []);

  /** A deleted book cannot stay in the basket. */
  const dropFromBasket = useCallback((bookId) => {
    setBasketBookIds((prev) => (prev.includes(bookId) ? prev.filter((id) => id !== bookId) : prev));
  }, []);

  async function handleCreateDeviceBasket() {
    if (basketBookIds.length === 0) {
      setBasketError("Select at least one book.");
      return;
    }
    if (basketBookIds.length > MAX_BASKET_BOOKS) {
      setBasketError("Maximum 50 books per basket.");
      return;
    }

    setBasketLoading(true);
    setBasketError(null);
    setBasketResult(null);

    try {
      const res = await authFetch("/device-baskets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: "kindle", bookIds: basketBookIds }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.success === false) {
        // Two shapes reach here: the route's own `{ error: "<string>" }` and
        // the zod middleware's `{ success:false, error:{ message, code,
        // details } }`. Reading `json.error` alone rendered the second as
        // "[object Object]" in the toast.
        const message =
          json?.error?.message ||
          json?.message ||
          (typeof json?.error === "string" ? json.error : null) ||
          `Failed to create basket (${res.status})`;
        throw new Error(message);
      }

      setBasketResult(json); // { slug, url, expiresAt }
      setBasketResultOpen(true);
    } catch (err) {
      setBasketError(err.message || "Failed to create device basket.");
    } finally {
      setBasketLoading(false);
    }
  }

  return {
    selectMode,
    setSelectMode,
    basketBookIds,
    basketLoading,
    basketError,
    setBasketError,
    basketResult,
    setBasketResult,
    basketResultOpen,
    setBasketResultOpen,
    toggleBasket,
    clearBasket,
    dropFromBasket,
    handleCreateDeviceBasket,
  };
}
