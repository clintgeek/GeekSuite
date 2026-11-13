/**
 * @geeksuite/backdrop — pick and preload a wallpaper from basegeek's backdrop
 * service (DOCS/BACKDROP_SERVICE_PLAN.md).
 *
 * Plain JS, no framework, no dependencies: StartGeek is Tailwind and the
 * login is MUI, and both only need "give me a wallpaper URL that has already
 * loaded, or tell me there isn't one". Never throws — a missing wallpaper is
 * a cosmetic gap, so every failure resolves to null and the caller keeps its
 * plain ground.
 */

const DEFAULT_TIMEOUT_MS = 8000;

/** 'portrait' when the viewport is taller than it is wide. */
export function orientationFor(width, height) {
  return height > width ? 'portrait' : 'landscape';
}

/** The manifest's photos, or [] on any failure. */
export async function fetchBackdrops(base, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    const res = await fetchImpl(new URL('/api/backdrops', base).href, {
      credentials: 'omit',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body?.photos) ? body.photos : [];
  } catch {
    return [];
  }
}

/** Resolve once `url` has loaded as an image, reject if it fails or stalls. */
export function preloadImage(url, { ImageCtor = globalThis.Image, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const img = new ImageCtor();
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(url); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('load failed')); };
    img.src = url;
  });
}

/**
 * Pick a random photo for this viewport and preload it. Tries up to
 * `attempts` different photos before giving up.
 *
 * @param {object} opts
 * @param {string} opts.base          basegeek's origin, e.g. https://basegeek.clintgeek.com
 * @param {number} [opts.width]       viewport width  (defaults to window)
 * @param {number} [opts.height]      viewport height (defaults to window)
 * @returns {Promise<null | { url: string, credit: string|null, source: string, orientation: string }>}
 */
export async function loadBackdrop({
  base,
  width = globalThis.innerWidth ?? 1920,
  height = globalThis.innerHeight ?? 1080,
  attempts = 3,
  random = Math.random,
  fetchImpl,
  ImageCtor,
  timeoutMs,
} = {}) {
  const photos = await fetchBackdrops(base, { fetchImpl, timeoutMs });
  const orientation = orientationFor(width, height);
  const pool = [...photos];
  for (let i = 0; i < attempts && pool.length; i++) {
    const [photo] = pool.splice(Math.floor(random() * pool.length), 1);
    const path = photo?.[orientation];
    if (typeof path !== 'string') continue;
    const url = new URL(path, base).href;
    try {
      await preloadImage(url, { ImageCtor, timeoutMs });
      return { url, credit: photo.credit ?? null, source: photo.source, orientation };
    } catch {
      // try another photo
    }
  }
  return null;
}
