# Local Auth Cookie Rewrites

FitnessGeek proxies all auth traffic through `/api/auth/*`, which in turn forwards to BaseGeek. BaseGeek always issues cookies scoped to `.clintgeek.com`, so when we run the frontend/backend on `localhost` the browser normally ignores those cookies and you cannot stay logged in.

To keep local sessions working we now rewrite the `Set-Cookie` headers in non-production environments:

1. **Check the environment** – in `backend/src/routes/authRoutes.js` the helper `forwardSetCookieHeaders` now inspects `NODE_ENV`. When `NODE_ENV !== 'production'` we assume we are running locally.
2. **Detect target domain** – use `req.hostname` (e.g., `localhost`) or override via `LOCAL_AUTH_COOKIE_DOMAIN` if you need something like `dev.myapp.test`.
3. **Rewrite cookie attributes**:
   - Replace any existing `Domain=...` attribute with the host from step #2 so the browser stores `geek_token`/`geek_refresh` for your local origin.
   - Strip `Secure` when we are serving plain HTTP (common for local dev). If you are terminating TLS locally you can keep it.
4. **Leave production untouched** – when `NODE_ENV === 'production'` the proxy simply forwards BaseGeek cookies unchanged.

## How to enable on other services

When you need the same behavior elsewhere:

1. Copy the helper from `authRoutes.js`, or better yet, extract it into a shared utility and import it in each proxy route.
2. Ensure all proxied routes call `forwardSetCookieHeaders(req, res, upstreamResponse.headers)` after each BaseGeek request.
3. Document any custom domains in `.env` using `LOCAL_AUTH_COOKIE_DOMAIN=<your-local-host>`.

With these rewrites in place, BaseGeek will still honor the JWTs because the token value is untouched—the browser simply sends them back on the local origin, and the backend forwards them upstream.
