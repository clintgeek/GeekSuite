import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, act } from '@testing-library/react';
import { GraphQLError } from 'graphql';
import { useMembership } from '../../App';
import NotAMember from '../../components/NotAMember';
import { GET_THING_VOCABULARY } from '../../graphql/queries';
import { isNotMemberError, onNotMember, reportNotMember, resetMembership } from '../../membership';
import { request, ApiError } from '../../api/rest';
import { renderWithProviders } from '../testUtils';

vi.mock('@geeksuite/auth', () => ({ csrfHeaders: () => ({ 'X-CSRF-Token': 't' }) }));

afterEach(() => {
  resetMembership();
  vi.unstubAllGlobals();
});

function Gate({ onSignOut }) {
  const { checking, notMember } = useMembership();
  if (notMember) return <NotAMember user={{ email: 'guest@example.com' }} onSignOut={onSignOut} />;
  return <p>{checking ? 'checking' : 'the app'}</p>;
}

const vocab = { __typename: 'ThingVocabulary', fieldKinds: ['text'], dateKinds: ['other'], photoRoles: ['overview'], documentRoles: ['other'], relationshipKinds: ['stored-with'], missingKeys: ['photo'], trashDays: 30 };

describe('the member gate', () => {
  it('a NOT_A_MEMBER answer shows the calm members-only page, with sign-out', async () => {
    const onSignOut = vi.fn();
    const mocks = [
      {
        request: { query: GET_THING_VOCABULARY },
        result: { errors: [new GraphQLError('ThingGeek is only open to members of this household.', { extensions: { code: 'NOT_A_MEMBER' } })] },
      },
    ];
    renderWithProviders(<Gate onSignOut={onSignOut} />, { mocks });
    expect(await screen.findByRole('heading', { name: 'ThingGeek is only open to members of this household' })).toBeInTheDocument();
    expect(screen.getByText('guest@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it('a member gets the app', async () => {
    renderWithProviders(<Gate onSignOut={() => {}} />, { mocks: [{ request: { query: GET_THING_VOCABULARY }, result: { data: { thingVocabulary: vocab } } }] });
    expect(screen.getByText('checking')).toBeInTheDocument();
    expect(await screen.findByText('the app')).toBeInTheDocument();
  });

  it('any other error is not a verdict: the app opens', async () => {
    renderWithProviders(<Gate onSignOut={() => {}} />, { mocks: [{ request: { query: GET_THING_VOCABULARY }, error: new Error('Failed to fetch') }] });
    expect(await screen.findByText('the app')).toBeInTheDocument();
  });

  it('a REST 403 later flips an open app to the page', async () => {
    renderWithProviders(<Gate onSignOut={() => {}} />, { mocks: [{ request: { query: GET_THING_VOCABULARY }, result: { data: { thingVocabulary: vocab } } }] });
    await screen.findByText('the app');
    act(() => reportNotMember());
    expect(await screen.findByTestId('not-a-member')).toBeInTheDocument();
  });
});

describe('isNotMemberError', () => {
  it('recognises every shape the code arrives in', () => {
    expect(isNotMemberError({ graphQLErrors: [{ extensions: { code: 'NOT_A_MEMBER' } }] })).toBe(true);
    expect(isNotMemberError({ networkError: { result: { errors: [{ extensions: { code: 'NOT_A_MEMBER' } }] } } })).toBe(true);
    expect(isNotMemberError({ code: 'NOT_A_MEMBER' })).toBe(true);
    expect(isNotMemberError({ body: { code: 'NOT_A_MEMBER' } })).toBe(true);
    expect(isNotMemberError({ graphQLErrors: [{ extensions: { code: 'UNAUTHENTICATED' } }] })).toBe(false);
    expect(isNotMemberError(new Error('nope'))).toBe(false);
    expect(isNotMemberError(null)).toBe(false);
  });
});

describe('rest.js', () => {
  it('403 NOT_A_MEMBER rejects with that code and tells the app', async () => {
    const heard = vi.fn();
    const off = onNotMember(heard);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'NOT_A_MEMBER', message: 'Members only.' }), { status: 403, headers: { 'content-type': 'application/json' } })));
    const err = await request('/things/t1/files', { method: 'POST', body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('NOT_A_MEMBER');
    expect(heard).toHaveBeenCalledWith(true);
    const [, init] = fetch.mock.calls[0];
    expect(init.headers['X-CSRF-Token']).toBe('t');
    expect(init.credentials).toBe('include');
    off();
  });

  it('a plain 403 is not the member gate', async () => {
    const heard = vi.fn();
    const off = onNotMember(heard);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } })));
    const err = await request('/x').catch((e) => e);
    expect(err.message).toBe('Forbidden');
    expect(heard).not.toHaveBeenCalled();
    off();
  });

  it('unwraps { success, data }', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: { ok: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } })));
    await expect(request('/x')).resolves.toEqual({ ok: 1 });
  });
});
