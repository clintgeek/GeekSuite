// Route/fixture plumbing shared by every app's fixtures.mjs.
//
// Three things here are hard-won and easy to get wrong again:
//
// 1. Playwright matches routes newest-first, so a catch-all must be
//    registered FIRST or it swallows every specific handler after it.
// 2. Chromium refuses a wildcard Access-Control-Allow-Origin on a
//    credentialed request, and the apps send credentials. Echo the caller's
//    Origin header and answer the OPTIONS preflight, or the request fails in
//    a way that looks like a dead backend.
// 3. Apollo clients send the operation name in the body, but a few callers
//    build the document by hand and leave operationName null — so fall back
//    to reading the operation off the query text.

export const corsHeaders = (route, fallbackOrigin = '*') => ({
  'Access-Control-Allow-Origin': route.request().headers().origin || fallbackOrigin,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
});

export function json(route, data, status = 200) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: corsHeaders(route), body: '' });
  }
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: corsHeaders(route),
    body: JSON.stringify(data),
  });
}

export function body(route, { contentType, body: content, status = 200 }) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: corsHeaders(route), body: '' });
  }
  return route.fulfill({ status, contentType, headers: corsHeaders(route), body: content });
}

// The suite session. basegeek's own UI reads /api/auth/profile (bare user
// object, with a role — the admin gate depends on it); everything else reads
// /api/me or /api/users/me and expects { user }.
export const DEFAULT_USER = {
  id: 'u1',
  username: 'chef',
  email: 'chef@example.com',
  displayName: 'Chef Crocker',
  firstName: 'Clint',
  lastName: 'Crocker',
  role: 'admin',
};

export async function sessionRoutes(ctx, user = DEFAULT_USER) {
  // Registration order is reverse precedence: broadest first, most specific
  // last. Get this backwards and `/api/auth/**` swallows `/api/auth/profile`,
  // which returns { user } instead of the bare user — basegeek's RequireAdmin
  // then reads `role` off an object that hasn't got one and every admin page
  // renders "admin-only" instead of itself.
  await ctx.route(/\/api\//, (r) => json(r, { success: true, data: {} }));
  await ctx.route('**/api/auth/**', (r) => json(r, { user }));
  await ctx.route('**/api/health', (r) => json(r, { status: 'ok', uptime: 1234 }));
  await ctx.route('**/api/me', (r) => json(r, { user }));
  await ctx.route('**/api/users/me', (r) => json(r, { user }));
  await ctx.route('**/api/auth/profile', (r) => json(r, user));
}

const opFromDocument = (text = '') => {
  const m = /\b(?:query|mutation|subscription)\s+([A-Za-z0-9_]+)/.exec(text);
  return m ? m[1] : null;
};

// ops: { OperationName: data } or a function (op, variables, request) => data.
export async function graphqlRoute(ctx, ops, { onMiss } = {}) {
  await ctx.route('**/graphql', (r) => {
    if (r.request().method() === 'OPTIONS') {
      return r.fulfill({ status: 204, headers: corsHeaders(r), body: '' });
    }
    let payload = {};
    try {
      payload = JSON.parse(r.request().postData() || '{}');
    } catch {
      /* a malformed body is a miss, not a crash */
    }
    const op = payload.operationName || opFromDocument(payload.query);
    const resolve = typeof ops === 'function' ? ops : (name, vars) => {
      const entry = ops[name];
      return typeof entry === 'function' ? entry(vars, r) : entry;
    };
    const data = resolve(op, payload.variables || {}, r);
    if (data === undefined) {
      if (onMiss) onMiss(op);
      else console.log(`  [graphql] unstubbed op: ${op}`);
      return json(r, { data: {} });
    }
    return json(r, { data });
  });
}

export const svg = (route, markup) => body(route, { contentType: 'image/svg+xml', body: markup });
