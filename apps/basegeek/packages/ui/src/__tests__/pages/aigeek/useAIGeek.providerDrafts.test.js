/**
 * useAIGeek.providerDrafts.test.js — provider key drafts across a reload.
 *
 * Provider rows stay open until Save key or Cancel, so two pasted keys can sit
 * side by side. Saving one reloads the configuration; that reload used to
 * blank every row's draft, leaving the other row open and silently empty
 * (review 2026-11-20). And Cancel used to clear only the key, leaving an
 * edited Cloudflare Account ID and `touched` behind for a later Save.
 *
 * Every key here is an obviously fake placeholder.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const { query, mutate, get } = vi.hoisted(() => ({
  query: vi.fn(),
  mutate: vi.fn(),
  get: vi.fn(),
}));

vi.mock('../../../apolloClient', () => ({ apolloClient: { query, mutate } }));
vi.mock('../../../api', () => ({ default: { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

import { useAIGeek, keepKeyDrafts } from '../../../pages/aigeek/useAIGeek';

const SERVER_CONFIG = {
  groq: { hasKey: true, keyHint: '…0001', enabled: true },
  openrouter: { hasKey: false, keyHint: '', enabled: false },
  cloudflare: { hasKey: true, keyHint: '…0002', enabled: true, accountId: 'server-account' },
};

beforeEach(() => {
  query.mockReset();
  mutate.mockReset();
  get.mockReset();
  query.mockImplementation(({ query: doc }) => {
    const name = doc.definitions[0].name.value;
    if (name === 'GetAIConfig') return Promise.resolve({ data: { aiConfig: SERVER_CONFIG } });
    return Promise.resolve({ data: {} });
  });
  mutate.mockResolvedValue({ data: {} });
  get.mockResolvedValue({ data: {} });
});

async function mountLoaded() {
  const notify = vi.fn();
  const hook = renderHook(() => useAIGeek(notify));
  await waitFor(() => expect(Object.keys(hook.result.current.state.config)).toHaveLength(3));
  return hook;
}

describe('provider key drafts', () => {
  it('saving one open row keeps the key typed into another open row', async () => {
    const { result } = await mountLoaded();
    act(() => {
      result.current.setConfigField('groq', 'apiKey', 'FAKE-groq-placeholder');
      result.current.setConfigField('openrouter', 'apiKey', 'FAKE-openrouter-placeholder');
    });

    let ok;
    await act(async () => { ok = await result.current.saveProviderKey('groq'); });
    expect(ok).toBe(true);

    const { config } = result.current.state;
    // The saved row is cleared by the reload…
    expect(config.groq).toMatchObject({ apiKey: '', touched: false, keyHint: '…0001' });
    // …the other open row still holds its draft, ready for its own Save key.
    expect(config.openrouter).toMatchObject({ apiKey: 'FAKE-openrouter-placeholder', touched: true });
  });

  it('Cancel puts a row back to the server state: key, Account ID and touched', async () => {
    const { result } = await mountLoaded();
    act(() => {
      result.current.setConfigField('cloudflare', 'apiKey', 'FAKE-cf-placeholder');
      result.current.setConfigField('cloudflare', 'accountId', 'edited-account');
    });
    act(() => { result.current.discardProviderDraft('cloudflare'); });
    expect(result.current.state.config.cloudflare).toMatchObject({
      apiKey: '',
      accountId: 'server-account',
      touched: false,
    });
  });
});

describe('keepKeyDrafts', () => {
  it('carries only touched rows, and never the row that just saved', () => {
    const prev = {
      a: { apiKey: 'FAKE-a', touched: true },
      b: { apiKey: '', touched: false },
      c: { apiKey: 'FAKE-c', touched: true, accountId: 'typed' },
    };
    const next = {
      a: { apiKey: '', touched: false, keyHint: 'x' },
      b: { apiKey: '', touched: false },
      c: { apiKey: '', touched: false, accountId: 'server' },
    };
    expect(keepKeyDrafts(prev, next, 'a')).toEqual({
      a: next.a,
      b: next.b,
      c: { apiKey: 'FAKE-c', touched: true, accountId: 'typed' },
    });
  });
});
