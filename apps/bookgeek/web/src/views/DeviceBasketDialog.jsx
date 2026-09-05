/**
 * BookGeek device basket result overlay — shown after a Kindle basket is made.
 *
 * Lifted verbatim out of `App.jsx`. Rendered only when a basket exists, so
 * `basketResult` is always populated here.
 */
import React from "react";

export default function DeviceBasketDialog({
  basketResult,
  clearBasket,
  profile,
  setBasketError,
  setBasketResult,
  setBasketResultOpen,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6"
      onClick={() => setBasketResultOpen(false)}
    >
      <div
        className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-amber-800/60 bg-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Device Download Basket
            </h2>
            <p className="text-[11px] text-slate-500">
              {profile?.deviceWord
                ? "Visit the page and enter your word on your e-reader"
                : "Type this URL into your Kindle browser"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBasketResultOpen(false)}
            aria-label="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-sm font-semibold text-slate-300 hover:border-slate-500 hover:text-slate-50"
          >
            ×
          </button>
        </div>

        <div className="space-y-5 px-5 py-6">
          {profile?.deviceWord ? (
            <>
              {/* Easy path — device word is set, this is primary */}
              <div className="space-y-4 rounded-xl border border-amber-700/50 bg-amber-950/40 px-4 py-5 text-center">
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-widest text-amber-400/80">
                    On your e-reader, go to
                  </div>
                  <div
                    style={{ fontFamily: '"Roboto Mono", monospace', fontSize: '1.35rem', letterSpacing: '0.02em', lineHeight: '1.3' }}
                    className="font-bold text-amber-100 break-all"
                  >
                    {basketResult.landingUrl || "/download-basket"}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-widest text-amber-400/80">
                    and enter your word
                  </div>
                  <div
                    style={{ fontFamily: '"Roboto Mono", monospace', fontSize: '1.75rem', letterSpacing: '0.04em' }}
                    className="font-bold text-amber-100 break-all"
                  >
                    {profile.deviceWord}
                  </div>
                </div>
              </div>

              {/* Full URL — secondary fallback */}
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-3 text-center">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                  Or type the full URL directly
                </div>
                <div className="text-[11px] text-slate-400 break-all">
                  {basketResult.url || ""}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Large slug display — hand-typed on Kindle keyboard */}
              <div className="rounded-xl border border-amber-700/50 bg-amber-950/40 px-4 py-5 text-center">
                <div
                  className="mb-1 text-[11px] uppercase tracking-widest text-amber-400/80"
                >
                  4-word URL
                </div>
                <div
                  style={{ fontFamily: '"Roboto Mono", monospace', fontSize: '1.5rem', letterSpacing: '0.04em', lineHeight: '1.3' }}
                  className="font-bold text-amber-100 break-all"
                >
                  {basketResult.slug
                    ? basketResult.slug.split("-").join(" · ")
                    : ""}
                </div>
                <div className="mt-3 text-[11px] text-slate-400 break-all">
                  {basketResult.url || ""}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-center text-[11px] text-slate-500">
                Tip: set a device word in Settings to make this easier to
                type on your e-reader.
              </div>
            </>
          )}

          {/* Expiry */}
          {basketResult.expiresAt && (
            <div className="text-center text-[12px] text-slate-400">
              Expires at{" "}
              <span className="font-medium text-slate-200">
                {new Date(basketResult.expiresAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {" "}(30 minutes)
            </div>
          )}

          {/* Copy button */}
          <button
            type="button"
            onClick={() => {
              const toCopy = basketResult.url || "";
              if (navigator.clipboard) {
                navigator.clipboard.writeText(toCopy).catch(() => {});
              }
            }}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 hover:border-slate-500 hover:bg-slate-800"
          >
            Copy URL to clipboard
          </button>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setBasketResult(null);
                setBasketResultOpen(false);
                setBasketError(null);
              }}
              className="flex-1 rounded-lg border border-amber-700/60 bg-amber-900/30 px-4 py-2 text-xs font-medium text-amber-200 hover:bg-amber-900/60"
            >
              Create new basket
            </button>
            <button
              type="button"
              onClick={() => {
                clearBasket();
              }}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:border-slate-500"
            >
              Done / clear selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
