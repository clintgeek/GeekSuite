/**
 * timeoutLink.test.js — the OPT-IN request timeout (plan 1.10, 2026-11-15).
 *
 * A request that asks for `context.timeoutMs` fails with a TimeoutError and
 * aborts its fetch when no answer arrives in time. A request that does not
 * ask is never cut off — several apps run long AI calls through this client.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApolloLink, Observable, execute, gql } from '@apollo/client/core';

import { timeoutLink, TimeoutError } from '../index.js';

const QUERY = gql`query Ping { ping }`;

/** A terminating link that answers after `delayMs`, recording the signal it saw. */
function slowLink(delayMs, seen) {
  return new ApolloLink((operation) => new Observable((observer) => {
    seen.signal = operation.getContext().fetchOptions?.signal ?? null;
    const t = setTimeout(() => {
      observer.next({ data: { ping: 'pong' } });
      observer.complete();
    }, delayMs);
    return () => clearTimeout(t);
  }));
}

function run(link, context) {
  return new Promise((resolve, reject) => {
    execute(link, { query: QUERY, context }).subscribe({
      next: (r) => resolve(r),
      error: (e) => reject(e),
    });
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('timeoutLink', () => {
  it('fails a request that asked for a timeout and got no answer in time', async () => {
    vi.useFakeTimers();
    const seen = {};
    const p = run(ApolloLink.from([timeoutLink, slowLink(20_000, seen)]), { timeoutMs: 15_000 });
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(15_001);
    await assertion;
    expect(seen.signal?.aborted).toBe(true);
  });

  it('lets an answer that arrives in time through', async () => {
    vi.useFakeTimers();
    const p = run(ApolloLink.from([timeoutLink, slowLink(100, {})]), { timeoutMs: 15_000 });
    await vi.advanceTimersByTimeAsync(101);
    await expect(p).resolves.toEqual({ data: { ping: 'pong' } });
  });

  it('never times out a request that did not ask (no global default)', async () => {
    vi.useFakeTimers();
    const seen = {};
    const p = run(ApolloLink.from([timeoutLink, slowLink(120_000, seen)]), {});
    await vi.advanceTimersByTimeAsync(120_001);
    await expect(p).resolves.toEqual({ data: { ping: 'pong' } });
    expect(seen.signal).toBeNull();
  });

  it('marks the error so a caller can tell a timeout from a refusal', () => {
    const err = new TimeoutError(15_000);
    expect(err.name).toBe('TimeoutError');
    expect(err.timeout).toBe(true);
  });
});
