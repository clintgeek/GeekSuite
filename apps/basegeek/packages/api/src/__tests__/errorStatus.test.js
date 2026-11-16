/**
 * errorStatus.test.js — SUITE_REVIEW_2026-11 S4.
 *
 * body-parser and cors errors keep their 4xx status instead of reaching the
 * client as 500 "Internal Server Error". Real body-parser / cors middleware
 * produce the errors here; the handler is the same shape as server.js's, and a
 * source check pins that server.js really consults clientErrorResponse before
 * its 500 line.
 */
import { describe, it, expect } from '@jest/globals';
import express from 'express';
import cors from 'cors';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { clientErrorResponse, corsOriginError } from '../middleware/errorStatus.js';

function buildApp() {
  const app = express();
  app.use(cors({
    origin: (origin, cb) => (!origin || origin === 'https://ok.example' ? cb(null, true) : cb(corsOriginError(), false)),
  }));
  app.use(express.json({ limit: '64b' }));
  app.post('/echo', (req, res) => res.json({ got: req.body }));
  app.get('/boom', () => { throw new Error('kaboom'); });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const clientError = clientErrorResponse(err, 'req-1');
    if (clientError) return res.status(clientError.status).json(clientError.body);
    res.status(500).json({ message: 'Internal Server Error', requestId: 'req-1' });
  });
  return app;
}

describe('client errors keep their status', () => {
  const app = buildApp();

  it('malformed JSON → 400 entity.parse.failed', async () => {
    const res = await request(app).post('/echo').set('Content-Type', 'application/json').send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('entity.parse.failed');
    expect(res.body.requestId).toBe('req-1');
  });

  it('over-limit body → 413 entity.too.large', async () => {
    const res = await request(app).post('/echo').send({ big: 'x'.repeat(500) });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('entity.too.large');
  });

  it('disallowed Origin → 403 cors.origin_denied', async () => {
    const res = await request(app).post('/echo').set('Origin', 'https://evil.example').send({ a: 1 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('cors.origin_denied');
  });

  it('a real server error is still a 500 with no detail', async () => {
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal Server Error');
    expect(JSON.stringify(res.body)).not.toContain('kaboom');
  });

  it('never passes a non-exposed message through, and ignores 5xx statuses', () => {
    expect(clientErrorResponse({ status: 400, message: 'secret detail' }).body.message).toBe('Bad request');
    expect(clientErrorResponse({ status: 502, expose: true, message: 'x' })).toBeNull();
    expect(clientErrorResponse(new Error('plain'))).toBeNull();
  });
});

describe('server.js wiring', () => {
  const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  it('the error handler consults clientErrorResponse before answering 500', () => {
    const client = src.indexOf('clientErrorResponse(err, req.id)');
    const fiveHundred = src.indexOf("'500 handler'");
    expect(client).toBeGreaterThan(-1);
    expect(client).toBeLessThan(fiveHundred);
  });

  it('cors rejects a disallowed Origin with corsOriginError()', () => {
    expect(src).toContain('callback(corsOriginError(), false)');
  });

  it('/graphql is mounted behind gatewaySession(), not a bare optionalUser()', () => {
    expect(src).toContain("app.use('/graphql', gatewaySession());");
    expect(src).not.toMatch(/app\.use\('\/graphql', optionalUser\(/);
  });
});
