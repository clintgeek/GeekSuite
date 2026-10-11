/**
 * The SSRF guard — every outbound request NewsGeek makes (the ingest worker
 * AND reader discovery) goes through here. DOCS/NEWSGEEK_PLAN.md
 * "Reader-added sources", SSRF guard (non-negotiable):
 *
 *   - http(s) only; ports 80, 443 and 8080 only (or the scheme default);
 *   - no credentials in the URL;
 *   - the hostname is resolved and EVERY address is vetted: private,
 *     loopback, link-local, CGNAT, multicast, unspecified and reserved
 *     ranges are refused, v4 and v6 (mapped v4 judged as the v4 inside);
 *     a literal IP host is vetted the same way;
 *   - the connection goes to the address that was vetted, not to a second
 *     lookup (no DNS-rebinding window): http(s).request gets a custom
 *     `lookup` that answers with the pinned address, while the URL's
 *     hostname still drives the Host header, SNI and certificate checks;
 *   - redirects are followed by hand (max 5), and each hop is vetted again.
 *
 * A refused URL throws UnsafeUrlError ("That address isn't on the public
 * internet.") and nothing is sent. Network failures throw a TypeError with a
 * `cause` (the shape global fetch uses), so callers that already speak fetch
 * (fetchFeed) need no new branches.
 *
 * The returned function is fetch-compatible enough for fetchFeed and
 * discovery: (url, { method, headers, signal }) → a WHATWG Response whose
 * `url` is the final URL after redirects. Request input can never turn the
 * guard off: the only loosening hooks (`resolve`, `extraAllowedAddresses`,
 * `extraAllowedPorts`) are construction-time options for tests.
 */
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

export const UNSAFE_URL_MESSAGE = "That address isn't on the public internet.";
export const MAX_REDIRECTS = 5;
export const ALLOWED_PORTS = Object.freeze(['80', '443', '8080']);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

export class UnsafeUrlError extends Error {
  /** @param {string} reason  for logs only; the message is always the plain one */
  constructor(reason) {
    super(UNSAFE_URL_MESSAGE);
    this.name = 'UnsafeUrlError';
    this.code = 'UNSAFE_URL';
    this.reason = reason;
  }
}

/** Thrown when a caller-supplied request budget (discovery) runs out. */
export class BudgetExceededError extends Error {
  constructor() {
    super('request budget exhausted');
    this.name = 'BudgetExceededError';
    this.code = 'BUDGET_EXCEEDED';
  }
}

// ---------------------------------------------------------------------------
// Address classification (hand-written CIDR checks, no dependency)
// ---------------------------------------------------------------------------

/** "a.b.c.d" → unsigned 32-bit int, or null. */
function v4ToInt(addr) {
  const parts = addr.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

const v4Cidr = (base, bits) => {
  const b = v4ToInt(base);
  const size = 2 ** (32 - bits);
  return (n) => n >= b && n < b + size;
};

// Everything that is not ordinary public unicast.
const V4_BLOCKED = [
  v4Cidr('0.0.0.0', 8),        // "this network", incl. 0.0.0.0 unspecified
  v4Cidr('10.0.0.0', 8),       // private
  v4Cidr('100.64.0.0', 10),    // CGNAT (also Tailscale)
  v4Cidr('127.0.0.0', 8),      // loopback
  v4Cidr('169.254.0.0', 16),   // link-local (cloud metadata lives here)
  v4Cidr('172.16.0.0', 12),    // private
  v4Cidr('192.0.0.0', 24),     // IETF protocol assignments
  v4Cidr('192.0.2.0', 24),     // TEST-NET-1
  v4Cidr('192.88.99.0', 24),   // 6to4 relay anycast (deprecated)
  v4Cidr('192.168.0.0', 16),   // private
  v4Cidr('198.18.0.0', 15),    // benchmarking
  v4Cidr('198.51.100.0', 24),  // TEST-NET-2
  v4Cidr('203.0.113.0', 24),   // TEST-NET-3
  v4Cidr('224.0.0.0', 4),      // multicast
  v4Cidr('240.0.0.0', 4),      // reserved, incl. 255.255.255.255 broadcast
];

export function isPublicIPv4(addr) {
  const n = v4ToInt(addr);
  if (n == null) return false;
  return !V4_BLOCKED.some((inRange) => inRange(n));
}

/** IPv6 text → 8 hextets (numbers), or null. Handles `::` and a dotted-quad tail. */
function v6ToHextets(addr) {
  let s = String(addr).toLowerCase().replace(/%.*$/, ''); // zone id
  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted) {
    const n = v4ToInt(dotted[2]);
    if (n == null) return null;
    s = `${dotted[1]}${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (part) => (part === '' ? [] : part.split(':').map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN)));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  if ([...head, ...rest].some(Number.isNaN)) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - rest.length;
  if (fill < 1) return null;
  return [...head, ...Array(fill).fill(0), ...rest];
}

const v4FromWords = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

export function isPublicIPv6(addr) {
  const w = v6ToHextets(addr);
  if (!w) return false;
  const zeros = (from, to) => w.slice(from, to).every((x) => x === 0);

  // ::ffff:a.b.c.d (mapped) — judge the v4 inside.
  if (zeros(0, 5) && w[5] === 0xffff) return isPublicIPv4(v4FromWords(w[6], w[7]));
  // 64:ff9b::/96 (NAT64 well-known prefix) — judge the v4 inside.
  if (w[0] === 0x64 && w[1] === 0xff9b && zeros(2, 6)) return isPublicIPv4(v4FromWords(w[6], w[7]));
  // 2002::/16 (6to4) — the v4 sits in hextets 1–2.
  if (w[0] === 0x2002) return isPublicIPv4(v4FromWords(w[1], w[2]));

  // Only global unicast (2000::/3) is public at all. This alone refuses
  // ::/128, ::1, ::/96 (v4-compatible), 64:ff9b:1::/48, 100::/64,
  // fc00::/7 (ULA), fe80::/10 (link-local), fec0::/10, ff00::/8 (multicast).
  if ((w[0] & 0xe000) !== 0x2000) return false;
  // Carve-outs inside 2000::/3.
  if (w[0] === 0x2001 && w[1] < 0x0200) return false; // 2001::/23 IETF (Teredo, ORCHID, benchmarking…)
  if (w[0] === 0x2001 && w[1] === 0x0db8) return false; // 2001:db8::/32 documentation
  if (w[0] === 0x3fff && w[1] < 0x1000) return false;   // 3fff::/20 documentation (RFC 9637)
  return true;
}

/** True only for an ordinary public unicast address. Garbage → false. */
export function isPublicAddress(addr) {
  const fam = isIP(String(addr ?? '').replace(/%.*$/, ''));
  if (fam === 4) return isPublicIPv4(addr);
  if (fam === 6) return isPublicIPv6(addr);
  return false;
}

// ---------------------------------------------------------------------------
// URL vetting
// ---------------------------------------------------------------------------

/** getaddrinfo, every address (what http.request would have used). */
export async function systemResolve(hostname) {
  return dns.promises.lookup(hostname, { all: true, verbatim: true });
}

/**
 * Vet one URL. Resolves to { url, address, family } — the address to connect
 * to — or throws UnsafeUrlError.
 *
 * @param {string|URL} input
 * @param {object} [opts]
 * @param {(host: string) => Promise<Array<{address: string, family: number}>>} [opts.resolve]
 * @param {Iterable<string>} [opts.extraAllowedAddresses]  tests only
 * @param {Iterable<string>} [opts.extraAllowedPorts]      tests only
 */
export async function vetUrl(input, { resolve = systemResolve, extraAllowedAddresses = [], extraAllowedPorts = [] } = {}) {
  let url;
  try {
    url = input instanceof URL ? new URL(input.href) : new URL(String(input));
  } catch {
    throw new UnsafeUrlError('unparseable url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UnsafeUrlError(`scheme ${url.protocol}`);
  if (url.username || url.password) throw new UnsafeUrlError('credentials in url');
  // The test hook allows an extra ADDRESS only on an extra PORT, and the
  // other way round: 127.0.0.1 on a fixture server's port, never 127.0.0.1:80.
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const extraAddrs = new Set([...extraAllowedAddresses].map(String));
  const extraPort = new Set([...extraAllowedPorts].map(String)).has(port);
  const portOk = ALLOWED_PORTS.includes(port);
  if (!portOk && !extraPort) throw new UnsafeUrlError(`port ${port}`);
  const ok = (addr) => (portOk && isPublicAddress(addr)) || (extraPort && extraAddrs.has(addr));

  // The WHATWG parser has already turned 0x7f.1, 2130706433 etc. into dotted quads.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new UnsafeUrlError('no host');
  const literal = isIP(host);
  if (literal) {
    if (!ok(host)) throw new UnsafeUrlError(`address ${host}`);
    return { url, address: host, family: literal, addresses: [{ address: host, family: literal }] };
  }

  let addrs;
  try {
    addrs = await resolve(host);
  } catch (err) {
    throw new TypeError('fetch failed', { cause: { code: err?.code || 'ENOTFOUND' } });
  }
  if (!Array.isArray(addrs) || !addrs.length) {
    throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
  }
  for (const a of addrs) {
    // EVERY address must be public: a mixed answer is how rebinding starts.
    if (!a || !ok(String(a.address))) throw new UnsafeUrlError(`${host} resolves to ${a?.address}`);
  }
  // All of them are vetted, so all may be dialled (Node's happy-eyeballs
  // tries each); IPv4 first, because a container often has no v6 route.
  const addresses = addrs
    .map((a) => ({ address: String(a.address), family: a.family || isIP(String(a.address)) }))
    .sort((a, b) => a.family - b.family);
  return { url, address: addresses[0].address, family: addresses[0].family, addresses };
}

// ---------------------------------------------------------------------------
// The guarded fetch
// ---------------------------------------------------------------------------

/** A `lookup` for http(s).request that only ever answers with the vetted addresses. */
function pinnedLookup(addresses) {
  return (hostname, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'object' && options ? options : {};
    if (opts.all) cb(null, addresses.map((a) => ({ ...a })));
    else cb(null, addresses[0].address, addresses[0].family);
  };
}

function toHeaders(raw) {
  const h = new Headers();
  for (const [k, v] of Object.entries(raw || {})) {
    if (v == null) continue;
    if (Array.isArray(v)) for (const x of v) h.append(k, x);
    else h.append(k, String(v));
  }
  return h;
}

/** One request to a vetted address. Resolves with the node IncomingMessage. */
function requestOnce({ url, addresses }, { method, headers, signal }) {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method,
      headers,
      signal,
      agent: false,                    // no pooled socket from another lookup
      lookup: pinnedLookup(addresses),
      // The URL's hostname stays the TLS servername (SNI + cert check) and the Host header.
      ...(url.protocol === 'https:' && !isIP(url.hostname.replace(/^\[|\]$/g, '')) ? { servername: url.hostname } : {}),
    }, resolve);
    req.on('error', (err) => {
      if (err?.name === 'AbortError') reject(err);
      else reject(new TypeError('fetch failed', { cause: err }));
    });
    req.end();
  });
}

/**
 * Build a guarded fetch. Construction-time options only; nothing a request
 * carries can reach them.
 *
 * @param {object} [opts]
 * @param {Function} [opts.resolve]                 DNS override (tests)
 * @param {Iterable<string>} [opts.extraAllowedAddresses]  tests only (a local fixture server)
 * @param {Iterable<string>} [opts.extraAllowedPorts]      tests only
 * @param {number} [opts.maxRedirects]
 */
export function createSafeFetch({
  resolve = systemResolve, extraAllowedAddresses = [], extraAllowedPorts = [], maxRedirects = MAX_REDIRECTS,
} = {}) {
  const vetOpts = { resolve, extraAllowedAddresses, extraAllowedPorts };

  /**
   * @param {string|URL} input
   * @param {object} [init]  { method, headers, signal, budget: { remaining } } — `redirect` is ignored: always manual
   */
  async function safeFetch(input, init = {}) {
    const method = String(init.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') throw new TypeError(`safeFetch: ${method} not supported`);
    const headers = { ...(init.headers || {}) };
    let current = input;
    for (let hop = 0; ; hop += 1) {
      init.signal?.throwIfAborted();
      const target = await vetUrl(current, vetOpts);
      if (init.budget) {
        if (init.budget.remaining <= 0) throw new BudgetExceededError();
        init.budget.remaining -= 1;
      }
      const res = await requestOnce(target, { method, headers, signal: init.signal });
      const status = res.statusCode;
      const location = res.headers.location;
      if (REDIRECT_STATUSES.has(status) && location) {
        res.resume(); // discard the redirect body
        if (hop >= maxRedirects) throw new TypeError('fetch failed', { cause: { code: 'ETOOMANYREDIRECTS' } });
        let next;
        try {
          next = new URL(location, target.url);
        } catch {
          throw new TypeError('fetch failed', { cause: { code: 'EBADREDIRECT' } });
        }
        // Validators belong to the first URL only.
        delete headers['If-None-Match'];
        delete headers['If-Modified-Since'];
        current = next;
        continue;
      }
      if (status < 200 || status > 599) {
        res.destroy();
        throw new TypeError('fetch failed', { cause: { code: 'EBADSTATUS' } });
      }
      const nullBody = NULL_BODY_STATUSES.has(status) || method === 'HEAD';
      if (nullBody) res.resume();
      const response = new Response(nullBody ? null : Readable.toWeb(res), {
        status,
        statusText: res.statusMessage || '',
        headers: toHeaders(res.headers),
      });
      Object.defineProperty(response, 'url', { value: target.url.href });
      return response;
    }
  }
  return safeFetch;
}

/** The production guard: system DNS, no exceptions. */
export const safeFetch = createSafeFetch();

export default { safeFetch, createSafeFetch, vetUrl, isPublicAddress, UnsafeUrlError, BudgetExceededError, UNSAFE_URL_MESSAGE };
