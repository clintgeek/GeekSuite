/**
 * The ZXing loader for `components/BarcodeScanner`.
 *
 * ZXing is the *fallback* decoder: Chrome on Android has a native
 * `BarcodeDetector` and never gets here. Everything else (iOS Safari,
 * desktop Firefox) needs a WASM-free JS decoder, and `@zxing/library`'s UMD
 * build is the one this scanner was written against.
 *
 * **Why it is a CDN <script> and not an import.** It is not installed —
 * neither `@zxing/library` nor `@zxing/browser` exists in this workspace's
 * `node_modules`, at the app level or the repo root — and adding a dependency
 * was not on the table for the pass that hardened this. So the script stays
 * remote, and the two things that make a remote script dangerous are closed
 * off instead:
 *
 *   1. **Exact version.** `@zxing/library@0.19.1`, never a range and never
 *      `latest`. A range lets the CDN decide what code runs in the page.
 *   2. **Subresource Integrity.** `ZXING_SRI` is the SHA-384 of that exact
 *      file. The browser refuses to execute anything whose hash differs, so a
 *      compromised or substituted CDN response fails closed — the scanner
 *      falls back to manual entry instead of running someone else's code on a
 *      page that holds the user's session. `crossOrigin: 'anonymous'` is
 *      required for SRI to be checked at all on a cross-origin script.
 *
 * The hash was computed from the file itself and cross-checked against a
 * second, independent CDN (jsDelivr) serving byte-identical content, so it
 * pins the canonical npm artifact rather than one mirror's copy:
 *
 *   curl -sL <ZXING_URL> | openssl dgst -sha384 -binary | openssl base64 -A
 *
 * **This is a mitigation, not the cure.** The cure is vendoring: add
 * `@zxing/library` as a dependency and `await import('@zxing/library')` here,
 * which makes it an ordinary lazy chunk — offline-capable, precached by the
 * service worker, and with no third-party host in the trust boundary at all.
 * Do that the next time a dependency add is allowed; the only change needed
 * below is swapping the script tag for the dynamic import (the call site
 * already only wants `{ BrowserMultiFormatReader, BarcodeFormat }`).
 *
 * If the version is ever bumped, the hash MUST be recomputed in the same
 * command — a stale hash is a scanner that silently never loads.
 */

export const ZXING_VERSION = '0.19.1';

export const ZXING_URL =
  `https://unpkg.com/@zxing/library@${ZXING_VERSION}/umd/index.min.js`;

export const ZXING_SRI =
  'sha384-NyKHkzm0aj4yWFC3Hh4cp1VflBgCLfStVlAK6WJOdXAht/pj6RHbMcZgUj48rcAs';

/**
 * One in-flight load per page. Without this, opening the scanner, closing it
 * and opening it again while the first request is still in the air appends a
 * second <script> for the same file.
 */
let pending = null;

/**
 * Resolve with `window.ZXing`, loading the pinned script once if needed.
 *
 * Rejects if the script fails to load — which now includes an SRI mismatch,
 * because the browser reports a blocked script as an ordinary `error` event.
 * The caller treats that the same way it treats "no camera": it shows the
 * error and drops the user into manual barcode entry.
 *
 * @returns {Promise<object>} the ZXing UMD namespace
 */
export function loadZXing() {
  if (typeof window !== 'undefined' && window.ZXing) return Promise.resolve(window.ZXing);
  if (pending) return pending;

  pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = ZXING_URL;
    script.async = true;
    // Both are load-bearing and neither works without the other: SRI on a
    // cross-origin script is only enforced when the request is made in CORS
    // mode, and a CORS request without an integrity hash checks nothing.
    script.integrity = ZXING_SRI;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (typeof window !== 'undefined' && window.ZXing) {
        resolve(window.ZXing);
      } else {
        // Loaded but did not define the global — a truncated or wrong file.
        reject(new Error('Barcode decoder loaded but did not initialise'));
      }
    };
    script.onerror = () => {
      reject(new Error('Barcode decoder could not be loaded'));
    };
    document.head.appendChild(script);
  });

  // A failed load must not poison every later attempt: clear the cached
  // promise so re-opening the scanner retries (a flaky network is the common
  // case; a blocked hash simply fails again, which is correct).
  pending.catch(() => {
    pending = null;
  });

  return pending;
}

/** Test seam — drops the memoised in-flight promise. */
export function __resetZXingLoader() {
  pending = null;
}

export default loadZXing;
