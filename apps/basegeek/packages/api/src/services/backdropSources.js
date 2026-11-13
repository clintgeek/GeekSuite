/**
 * backdropSources.js — where wallpapers come from (DOCS/BACKDROP_SERVICE_PLAN.md).
 *
 * Each source is `{ id, candidates(n, deps) }`. `candidates` returns up to
 * `n` photos as `{ source, sourceId, credit, urls: { landscape, portrait } }`
 * — URLs only; the job downloads them. Both variants are the SAME photo at
 * two crops, so a phone held upright gets a picture composed for it instead
 * of the middle third of a landscape.
 *
 * Public sources only, no keys. A source that is down throws or returns []
 * and the job fills from the others; nothing here retries.
 *
 * Bing's images are licensed for wallpaper use only — which is all this
 * service does with them.
 */

export const LANDSCAPE = { w: 1920, h: 1080 };
export const PORTRAIT = { w: 1080, h: 1920 };

const TIMEOUT_MS = 15_000;

async function getJson(fetchImpl, url) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Bing Image of the Day: the last 8 days, via the (unofficial, keyless)
 * HPImageArchive feed. `urlbase` + `_WxH.jpg` gives the crop we want; Bing
 * publishes a native 1080x1920 portrait for each.
 */
export const bing = {
  id: 'bing',
  async candidates(n, { fetchImpl = fetch } = {}) {
    const data = await getJson(
      fetchImpl,
      `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=${Math.min(n, 8)}&mkt=en-US`,
    );
    return (data?.images || [])
      .filter((img) => typeof img?.urlbase === 'string' && img.urlbase.startsWith('/'))
      .slice(0, n)
      .map((img) => ({
        source: 'bing',
        sourceId: img.hsh || img.urlbase,
        credit: img.copyright || 'Bing',
        urls: {
          landscape: `https://www.bing.com${img.urlbase}_${LANDSCAPE.w}x${LANDSCAPE.h}.jpg`,
          portrait: `https://www.bing.com${img.urlbase}_${PORTRAIT.w}x${PORTRAIT.h}.jpg`,
        },
      }));
  },
};

/**
 * Picsum: its list endpoint gives ids + authors; `/id/{id}/W/H.jpg` crops the
 * same photo to any size. A random page keeps batches from repeating.
 */
export const picsum = {
  id: 'picsum',
  async candidates(n, { fetchImpl = fetch, random = Math.random } = {}) {
    const page = 1 + Math.floor(random() * 30);
    const list = await getJson(fetchImpl, `https://picsum.photos/v2/list?page=${page}&limit=${Math.max(n * 2, 10)}`);
    const rows = (Array.isArray(list) ? list : [])
      .filter((p) => p?.id != null && p.width >= p.height); // landscape originals crop better both ways
    return shuffle(rows, random).slice(0, n).map((p) => ({
      source: 'picsum',
      sourceId: String(p.id),
      credit: p.author ? `${p.author} / Unsplash via Picsum` : 'Picsum',
      urls: {
        landscape: `https://picsum.photos/id/${encodeURIComponent(p.id)}/${LANDSCAPE.w}/${LANDSCAPE.h}.jpg`,
        portrait: `https://picsum.photos/id/${encodeURIComponent(p.id)}/${PORTRAIT.w}/${PORTRAIT.h}.jpg`,
      },
    }));
  },
};

/**
 * LoremFlickr: Creative Commons Flickr photos by keyword. `lock` pins the
 * pick, so the same lock at two sizes is the same photo.
 */
const LOREMFLICKR_TAGS = 'landscape,nature';
export const loremflickr = {
  id: 'loremflickr',
  async candidates(n, { random = Math.random } = {}) {
    return Array.from({ length: n }, () => {
      const lock = 1 + Math.floor(random() * 100_000);
      const at = ({ w, h }) => `https://loremflickr.com/${w}/${h}/${LOREMFLICKR_TAGS}/all?lock=${lock}`;
      return {
        source: 'loremflickr',
        sourceId: String(lock),
        credit: 'Flickr (Creative Commons) via LoremFlickr',
        urls: { landscape: at(LANDSCAPE), portrait: at(PORTRAIT) },
      };
    });
  },
};

export const SOURCES = [bing, picsum, loremflickr];

function shuffle(arr, random) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Download one variant. Rejects anything that isn't a plausible photo: not an
 * image, suspiciously small (placeholder / "image unavailable" tiles), or
 * larger than we'd ever want to push to a phone.
 */
export const MIN_BYTES = 20 * 1024;
export const MAX_BYTES = 4 * 1024 * 1024;

export async function downloadImage(url, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!contentType.startsWith('image/')) throw new Error(`not an image (${contentType || 'no type'})`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length < MIN_BYTES) throw new Error(`too small (${data.length} B)`);
  if (data.length > MAX_BYTES) throw new Error(`too large (${data.length} B)`);
  return { data, contentType };
}
