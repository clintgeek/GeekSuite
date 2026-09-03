/**
 * csrfGuard.test.js — basegeek's CSRF origin guard (TODO_ORDER #12).
 *
 * server.js mounts @geeksuite/user's `csrfGuard()` with the allow-list from
 * lib/corsOrigins.js — the same list `cors()` gets, so the two cannot drift —
 * ahead of `cors()` and ahead of every route, including `/graphql`.
 *
 * server.js cannot be imported: it connects Mongo, aiGeek and Redis, starts
 * Apollo, and binds a port, all at module scope. So this suite reproduces the
 * mount exactly (cookie-parser → csrfGuard → routes) using the *real* guard
 * and the *real* resolved allow-list, and puts stub handlers behind it that
 * record whether they were reached. That is the right shape for what is under
 * test: the guard runs before any route, so what matters is the middleware
 * order and the allow-list, not what a particular resolver does afterwards.
 * Standing up Apollo with basegeek's real schema would not test the guard any
 * harder — the guard has already answered before Apollo is consulted — so
 * `/graphql` here is a stub that reports whether the mutation body got
 * through.
 *
 * Unit coverage for every branch of the guard itself (Referer fallback,
 * opaque origins, CSRF_GUARD=off/report, empty allow-list) lives in
 * packages/user/src/server/__tests__/csrfGuard.test.js. This file is about
 * basegeek's wiring and basegeek's list.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { csrfGuard } from '@geeksuite/user/server';
import {
  resolveAllowedOrigins,
  productionOrigins,
  devOnlyOrigins,
} from '../lib/corsOrigins.js';

const EVIL_ORIGIN = 'https://evil.example';
const OWN_ORIGIN = 'https://basegeek.clintgeek.com';

let reached;

/**
 * The middleware order server.js uses, with stub routes behind it.
 * `env` is passed through to the guard so CSRF_GUARD in the ambient
 * environment cannot change what these tests measure.
 */
function buildApp({ env = {}, allowedOrigins } = {}) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(csrfGuard({
    allowedOrigins: allowedOrigins ?? resolveAllowedOrigins({ NODE_ENV: 'production' }).origins,
    appName: 'basegeek',
    env,
  }));

  app.post('/api/users/preferences', (req, res) => {
    reached.push('rest');
    res.json({ ok: true });
  });
  app.get('/api/users/preferences', (req, res) => {
    reached.push('rest-get');
    res.json({ ok: true });
  });
  app.post('/graphql', (req, res) => {
    reached.push(`graphql:${req.body?.operationName ?? 'anonymous'}`);
    res.json({ data: { ok: true } });
  });
  app.get('/api/health', (req, res) => {
    reached.push('health');
    res.json({ status: 'ok' });
  });
  app.post('/openai/v1/chat/completions', (req, res) => {
    reached.push('openai');
    res.json({ ok: true });
  });

  return app;
}

let app;

beforeEach(() => {
  reached = [];
  app = buildApp();
});

const cookie = ['geek_token=a-valid-token'];

// ─────────────────────────────────────────────────────────────────────────────
// The allow-list itself
//
// basegeek's list is the widest in the suite by necessity: every app's
// frontend calls this API's GraphQL endpoint, either cross-origin (storygeek
// builds against https://basegeek.clintgeek.com/graphql) or through a proxy
// that forwards the browser's Origin. If an app's origin falls off this list,
// that app's GraphQL stops working in production — so pin it.
// ─────────────────────────────────────────────────────────────────────────────

describe('the resolved allow-list', () => {
  it('is the production list only when NODE_ENV=production', () => {
    const prod = resolveAllowedOrigins({ NODE_ENV: 'production' });
    expect(prod.origins).toEqual(productionOrigins);
    expect(prod.source).toBe('fallback');
    expect(prod.isProduction).toBe(true);
  });

  it('appends the dev/LAN origins outside production', () => {
    const dev = resolveAllowedOrigins({ NODE_ENV: 'development' });
    expect(dev.origins).toEqual([...productionOrigins, ...devOnlyOrigins]);
    expect(dev.isProduction).toBe(false);
  });

  it('never serves dev/LAN origins in production', () => {
    const prod = resolveAllowedOrigins({ NODE_ENV: 'production' });
    for (const devOrigin of devOnlyOrigins) {
      expect(prod.origins).not.toContain(devOrigin);
    }
  });

  it('CORS_ORIGINS overrides both lists and is reported as such', () => {
    const fromEnv = resolveAllowedOrigins({
      NODE_ENV: 'production',
      CORS_ORIGINS: ' https://a.test , https://b.test ,, ',
    });
    expect(fromEnv.origins).toEqual(['https://a.test', 'https://b.test']);
    expect(fromEnv.source).toBe('env');
  });

  it('carries every GeekSuite app origin that calls this GraphQL API', () => {
    const prod = resolveAllowedOrigins({ NODE_ENV: 'production' }).origins;
    for (const origin of [
      'https://basegeek.clintgeek.com',
      'https://notegeek.clintgeek.com',
      'https://bujogeek.clintgeek.com',
      'https://fitnessgeek.clintgeek.com',
      'https://storygeek.clintgeek.com',
      'https://flockgeek.clintgeek.com',
      'https://bookgeek.clintgeek.com',
      'https://start.clintgeek.com',
    ]) {
      expect(prod).toContain(origin);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL — the reason this mount matters
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /graphql', () => {
  it('lets a mutation from an allow-listed app origin through', async () => {
    const res = await request(app)
      .post('/graphql')
      .set('Cookie', cookie)
      .set('Origin', 'https://storygeek.clintgeek.com')
      .send({ operationName: 'CreateStory', query: 'mutation CreateStory { createStory { id } }' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['graphql:CreateStory']);
  });

  it('rejects a mutation from a third-party page with 403 before Apollo sees it', async () => {
    const res = await request(app)
      .post('/graphql')
      .set('Cookie', cookie)
      .set('Origin', EVIL_ORIGIN)
      .send({ operationName: 'DeleteEverything', query: 'mutation DeleteEverything { deleteAllTasks }' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'csrf_origin_rejected' });
    expect(reached).toEqual([]);
  });

  it('rejects a mutation whose only origin evidence is a foreign Referer', async () => {
    const res = await request(app)
      .post('/graphql')
      .set('Cookie', cookie)
      .set('Referer', `${EVIL_ORIGIN}/attack.html`)
      .send({ query: 'mutation { deleteAllTasks }' });

    expect(res.status).toBe(403);
    expect(reached).toEqual([]);
  });

  it('lets an Origin-less GraphQL call through — the in-app /graphql proxies forward cookie but not Origin', async () => {
    const res = await request(app)
      .post('/graphql')
      .set('Cookie', cookie)
      .send({ operationName: 'MyTasks', query: 'query MyTasks { tasks { id } }' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['graphql:MyTasks']);
  });

  it('a GraphQL POST with no cookie is not the guard\'s business', async () => {
    const res = await request(app)
      .post('/graphql')
      .set('Origin', EVIL_ORIGIN)
      .send({ query: 'mutation { deleteAllTasks }' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['graphql:anonymous']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REST surface
// ─────────────────────────────────────────────────────────────────────────────

describe('REST routes', () => {
  it('allows a cookie-authenticated POST from basegeek\'s own origin', async () => {
    const res = await request(app)
      .post('/api/users/preferences')
      .set('Cookie', cookie)
      .set('Origin', OWN_ORIGIN)
      .send({ theme: 'dark' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['rest']);
  });

  it('rejects the same POST from a third-party page', async () => {
    const res = await request(app)
      .post('/api/users/preferences')
      .set('Cookie', cookie)
      .set('Origin', EVIL_ORIGIN)
      .send({ theme: 'dark' });

    expect(res.status).toBe(403);
    expect(reached).toEqual([]);
  });

  it('does not block a GET from a foreign origin — mutations only', async () => {
    const res = await request(app)
      .get('/api/users/preferences')
      .set('Cookie', cookie)
      .set('Origin', EVIL_ORIGIN);

    expect(res.status).toBe(200);
    expect(reached).toEqual(['rest-get']);
  });

  it('leaves /api/health reachable with no credentials at all', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(reached).toEqual(['health']);
  });

  it('does not need an exemption for the /openai/v1 proxy: API-key clients send no cookie', async () => {
    const res = await request(app)
      .post('/openai/v1/chat/completions')
      .set('Authorization', 'Bearer sk-not-a-cookie')
      .send({ model: 'gpt-4', messages: [] });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['openai']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The escape hatch, on basegeek's own wiring
// ─────────────────────────────────────────────────────────────────────────────

describe('CSRF_GUARD escape hatch', () => {
  it('CSRF_GUARD=off makes basegeek accept the mutation it would otherwise reject', async () => {
    const offApp = buildApp({ env: { CSRF_GUARD: 'off' } });

    const res = await request(offApp)
      .post('/graphql')
      .set('Cookie', cookie)
      .set('Origin', EVIL_ORIGIN)
      .send({ operationName: 'DeleteEverything', query: 'mutation DeleteEverything { x }' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['graphql:DeleteEverything']);
  });

  it('CSRF_GUARD=report allows it too, so a soak can be run before enforcing', async () => {
    const reportApp = buildApp({ env: { CSRF_GUARD: 'report' } });

    const res = await request(reportApp)
      .post('/graphql')
      .set('Cookie', cookie)
      .set('Origin', EVIL_ORIGIN)
      .send({ operationName: 'DeleteEverything', query: 'mutation DeleteEverything { x }' });

    expect(res.status).toBe(200);
    expect(reached).toEqual(['graphql:DeleteEverything']);
  });

  it('an empty allow-list runs inert rather than 403-ing every mutation', async () => {
    const brokenApp = buildApp({ allowedOrigins: [] });

    const res = await request(brokenApp)
      .post('/graphql')
      .set('Cookie', cookie)
      .set('Origin', EVIL_ORIGIN)
      .send({ operationName: 'Whatever', query: 'mutation Whatever { x }' });

    expect(res.status).toBe(200);
  });
});
