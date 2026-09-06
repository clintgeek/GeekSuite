/**
 * The barcode decoder is third-party code fetched from a CDN at runtime, so
 * the two properties that make that survivable are the ones under test: the
 * URL names an exact version, and the tag carries an SRI hash plus the CORS
 * attribute without which the browser would not check that hash at all.
 *
 * The hash value itself is pinned here as a literal on purpose. If somebody
 * bumps ZXING_VERSION without recomputing the digest, this test fails — which
 * is the point, because in a browser the same mistake is a scanner that
 * silently never loads.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ZXING_URL,
  ZXING_SRI,
  ZXING_VERSION,
  loadZXing,
  __resetZXingLoader,
} from '../zxingLoader.js';

const appended = () => Array.from(document.head.querySelectorAll('script[src*="zxing"]'));

beforeEach(() => {
  __resetZXingLoader();
  delete window.ZXing;
  appended().forEach((s) => s.remove());
});

afterEach(() => {
  __resetZXingLoader();
  delete window.ZXing;
  appended().forEach((s) => s.remove());
  vi.restoreAllMocks();
});

describe('the pinned ZXing script', () => {
  it('names an exact version — no range, no "latest"', () => {
    expect(ZXING_URL).toContain(`@zxing/library@${ZXING_VERSION}/`);
    expect(ZXING_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ZXING_URL).not.toMatch(/latest|\^|~/);
  });

  it('is fetched over https', () => {
    expect(ZXING_URL.startsWith('https://')).toBe(true);
  });

  it('carries the SHA-384 digest of that exact file', () => {
    // Computed from the file and cross-checked against a second CDN:
    //   curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A
    expect(ZXING_SRI).toBe(
      'sha384-NyKHkzm0aj4yWFC3Hh4cp1VflBgCLfStVlAK6WJOdXAht/pj6RHbMcZgUj48rcAs'
    );
    expect(ZXING_SRI).toMatch(/^sha384-[A-Za-z0-9+/]+=*$/);
  });
});

describe('loadZXing', () => {
  it('appends ONE script with integrity and crossOrigin set', () => {
    loadZXing();

    const tags = appended();
    expect(tags).toHaveLength(1);
    expect(tags[0].src).toBe(ZXING_URL);
    expect(tags[0].integrity).toBe(ZXING_SRI);
    // Without CORS mode the browser skips the integrity check entirely.
    expect(tags[0].crossOrigin).toBe('anonymous');
    expect(tags[0].async).toBe(true);
  });

  it('does not append a second tag while the first is still in flight', () => {
    loadZXing();
    loadZXing();
    expect(appended()).toHaveLength(1);
  });

  it('resolves with the global once the script defines it', async () => {
    const promise = loadZXing();
    window.ZXing = { BrowserMultiFormatReader: class {}, BarcodeFormat: {} };
    appended()[0].onload();
    await expect(promise).resolves.toBe(window.ZXing);
  });

  it('short-circuits when the global is already there', async () => {
    window.ZXing = { BarcodeFormat: {} };
    await expect(loadZXing()).resolves.toBe(window.ZXing);
    expect(appended()).toHaveLength(0);
  });

  it('rejects when the script is blocked — an SRI mismatch looks like an error event', async () => {
    const promise = loadZXing();
    appended()[0].onerror();
    await expect(promise).rejects.toThrow('Barcode decoder could not be loaded');
  });

  it('rejects when the script loads but defines nothing', async () => {
    const promise = loadZXing();
    appended()[0].onload();
    await expect(promise).rejects.toThrow('did not initialise');
  });

  it('retries after a failure instead of caching the rejection forever', async () => {
    const first = loadZXing();
    appended()[0].onerror();
    await expect(first).rejects.toThrow();

    appended().forEach((s) => s.remove());
    // Let the internal `.catch` that clears the memo run before retrying.
    await Promise.resolve();

    const second = loadZXing();
    expect(appended()).toHaveLength(1);
    window.ZXing = { BarcodeFormat: {} };
    appended()[0].onload();
    await expect(second).resolves.toBe(window.ZXing);
  });
});
