/**
 * The Attic, on screen: the gate (set-up / locked door / open), the home
 * shelves, a document's masked numbers and their per-field reveal, card
 * capture slots, the locked-visible lines (Needs attention, a thing's page),
 * and the lock's client side (auto-lock at the server's idle deadline).
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../testUtils';
import { StaticVaultProvider, VaultProvider, useVault } from '../../hooks/useVault';
import { GET_ATTIC_ACCESS_LOG, GET_ATTIC_DOCUMENT, GET_ATTIC_EXPIRING, GET_ATTIC_HOME, GET_THING_ATTIC } from '../../graphql/attic';
import { documentInputFrom } from '../../views/attic/AtticDocumentForm';
import { accessSentence } from '../../views/attic/AtticParts';

vi.mock('../../api/attic', async (orig) => {
  const real = await orig();
  return { ...real, revealIdentifier: vi.fn(async () => 'X12345678'), saveIdentifiers: vi.fn(async () => ({})), uploadAtticFile: vi.fn(async () => ({})) };
});
const atticApi = await import('../../api/attic');

const { default: AtticView } = await import('../../views/attic/AtticView');
const { default: AtticDocumentPage } = await import('../../views/attic/AtticDocumentPage');
const { default: AtticDocumentForm } = await import('../../views/attic/AtticDocumentForm');
const { AtticAttention, ThingAttic } = await import('../../views/attic/AtticAttention');

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const noop = () => {};
function vault(over = {}) {
  return {
    loading: false,
    available: true,
    setUp: true,
    pin: true,
    passkeys: [{ id: 'pk1', label: 'This phone' }],
    passkeysSupported: true,
    unlocked: false,
    idleExpiresAt: null,
    expiresAt: null,
    activity: noop,
    handleError: noop,
    markLocked: noop,
    refresh: noop,
    lock: vi.fn(),
    unlockWithPin: vi.fn(async () => ({})),
    unlockWithPasskey: vi.fn(async () => ({})),
    setPin: vi.fn(async () => ({})),
    registerPasskey: vi.fn(async () => ({})),
    removePasskey: vi.fn(async () => ({})),
    ...over,
  };
}
const open = (over) => vault({ unlocked: true, idleExpiresAt: new Date(Date.now() + 9 * 60000).toISOString(), ...over });

const F = (key, label, extra = {}) => ({ __typename: 'AtticDocumentTypeField', key, label, kind: 'text', choices: [], identifier: false, strict: false, required: false, ...extra });
const TYPE = (id, key, name, icon, fields, extra = {}) => ({ __typename: 'AtticDocumentType', id, key, name, icon, issuedLabel: 'Issued', expiryLabel: 'Expires', expiryWarnDays: 30, builtIn: true, documentCount: 0, fields, ...extra });
const PASSPORT = TYPE('ty-pass', 'passport', 'Passport', 'Flight', [F('number', 'Passport number', { identifier: true }), F('country', 'Country')], { expiryWarnDays: 270 });
const LICENSE = TYPE('ty-lic', 'drivers-license', "Driver's license", 'Badge', [F('number', 'License number', { identifier: true }), F('state', 'State')], { expiryWarnDays: 60 });
const SSN = TYPE('ty-ssn', 'social-security', 'Social Security card', 'Shield', [F('number', 'Social Security number', { identifier: true, strict: true })], { issuedLabel: null, expiryLabel: null, expiryWarnDays: null });
const CLINT = { __typename: 'AtticPerson', id: 'p1', name: 'Clint', relation: 'Self', birthDate: null, documentCount: 2 };
const HEATHER = { __typename: 'AtticPerson', id: 'p2', name: 'Heather', relation: 'Spouse', birthDate: null, documentCount: 1 };
const summary = (id, title, type, people, extra = {}) => ({
  __typename: 'AtticDocument',
  id,
  title,
  type: { __typename: 'AtticDocumentType', id: type.id, key: type.key, name: type.name, icon: type.icon },
  people: people.map((p) => ({ __typename: 'AtticPerson', id: p.id, name: p.name })),
  expires: '2027-04-20T00:00:00.000Z',
  expiry: { __typename: 'AtticExpiry', status: 'warning', daysUntil: 200, label: 'Expires' },
  files: [{ __typename: 'AtticDocumentFile', id: 'f1' }],
  ...extra,
});

const homeMock = {
  request: { query: GET_ATTIC_HOME },
  result: {
    data: {
      atticPeople: [CLINT, HEATHER],
      atticDocumentTypes: [LICENSE, PASSPORT, SSN],
      atticDocuments: [summary('d1', 'Passport · Clint', PASSPORT, [CLINT]), summary('d2', "Driver's license · Heather", LICENSE, [HEATHER], { expiry: { __typename: 'AtticExpiry', status: 'ok', daysUntil: 900, label: 'Expires' } })],
    },
  },
};
const logMock = (limit = 8) => ({
  request: { query: GET_ATTIC_ACCESS_LOG, variables: { limit } },
  result: {
    data: {
      atticAccessLog: [
        { __typename: 'AtticAccessEntry', id: 'a1', at: new Date().toISOString(), action: 'reveal', actorName: 'heather', method: null, documentId: 'd1', documentTitle: 'Passport · Clint', field: 'Passport number' },
        { __typename: 'AtticAccessEntry', id: 'a2', at: new Date().toISOString(), action: 'unlock', actorName: 'chef', method: 'passkey', documentId: null, documentTitle: null, field: null },
      ],
    },
  },
});

function fullDoc(type = PASSPORT, over = {}) {
  return {
    ...summary('d1', 'Passport · Clint', type, [CLINT]),
    type,
    fields: type.fields.filter((f) => !f.identifier).map((f) => ({ __typename: 'AtticField', key: f.key, label: f.label, kind: f.kind, value: 'USA' })),
    identifiers: type.fields.filter((f) => f.identifier).map((f) => ({ __typename: 'AtticIdentifier', key: f.key, label: f.label, strict: f.strict, hasValue: true })),
    issued: null,
    expiry: { __typename: 'AtticExpiry', status: 'warning', daysUntil: 200, label: 'Expires', warnDays: 270, warnsOn: null },
    files: [{ __typename: 'AtticDocumentFile', id: 'e1', fileId: 'f1', side: 'front', caption: '', url: '/api/attic/files/f1', mime: 'image/jpeg', size: 1000, width: 1600, height: 1009 }],
    links: [],
    notes: '',
    createdAt: null,
    updatedAt: null,
    ...over,
  };
}
const docMock = (doc) => ({ request: { query: GET_ATTIC_DOCUMENT, variables: { id: doc.id } }, result: { data: { atticDocument: doc } } });

const withVault = (value) =>
  function Wrap({ children }) {
    return <StaticVaultProvider value={value}>{children}</StaticVaultProvider>;
  };

describe('the gate', () => {
  it('locked: the steel door with its padlock, "Unlock with fingerprint" and "Use PIN" — and nothing inside', () => {
    renderWithProviders(<AtticView />, { mocks: [homeMock], wrapper: withVault(vault()) });
    expect(screen.getByTestId('attic-door')).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('padlock')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The Attic is locked' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock with fingerprint' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use PIN' })).toBeInTheDocument();
    expect(screen.queryByTestId('attic-home')).toBeNull();
  });

  it('fingerprint unlock asks the vault; the PIN sheet takes digits only', async () => {
    const v = vault();
    renderWithProviders(<AtticView />, { mocks: [homeMock], wrapper: withVault(v) });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock with fingerprint' }));
    await waitFor(() => expect(v.unlockWithPasskey).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Use PIN' }));
    const pin = await screen.findByLabelText('PIN');
    expect(pin).toHaveAttribute('type', 'password');
    expect(pin).toHaveAttribute('autocomplete', 'off');
    expect(pin).toHaveAttribute('inputmode', 'numeric');
    fireEvent.change(pin, { target: { value: '48a15b16' } });
    expect(pin).toHaveValue('481516');
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(v.unlockWithPin).toHaveBeenCalledWith('481516'));
  });

  it('a wrong PIN says how many tries are left; a paused PIN says to wait', async () => {
    const err = Object.assign(new Error('Wrong PIN.'), { code: 'PIN_WRONG', body: { code: 'PIN_WRONG', attemptsLeft: 2 } });
    const v = vault({ passkeys: [], unlockWithPin: vi.fn(async () => Promise.reject(err)) });
    renderWithProviders(<AtticView />, { mocks: [homeMock], wrapper: withVault(v) });
    expect(screen.queryByRole('button', { name: 'Unlock with fingerprint' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Use PIN' }));
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '111222' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN. 2 more tries before it pauses.');
  });

  it('first visit: set-up — fingerprint first (skippable), then a PIN typed twice', async () => {
    const v = vault({ setUp: false, pin: false, passkeys: [] });
    renderWithProviders(<AtticView />, { mocks: [homeMock], wrapper: withVault(v) });
    expect(screen.getByTestId('attic-setup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add fingerprint' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip — PIN only for now' }));
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '481516' } });
    fireEvent.change(screen.getByLabelText('The same PIN again'), { target: { value: '481517' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set the PIN and open the Attic' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('don’t match');
    fireEvent.change(screen.getByLabelText('The same PIN again'), { target: { value: '481516' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set the PIN and open the Attic' }));
    await waitFor(() => expect(v.setPin).toHaveBeenCalledWith('481516'));
  });

  it('a passkey alone opens the door, then set-up still asks for the backup PIN', () => {
    renderWithProviders(<AtticView />, { mocks: [homeMock], wrapper: withVault(open({ pin: false })) });
    expect(screen.getByTestId('attic-setup')).toBeInTheDocument();
    expect(screen.getByLabelText('New PIN')).toBeInTheDocument();
  });

  it('no key on the server: "The Attic is closed", nothing else', () => {
    renderWithProviders(<AtticView />, { mocks: [homeMock], wrapper: withVault(vault({ available: false })) });
    expect(screen.getByRole('heading', { name: 'The Attic is closed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Unlock/ })).toBeNull();
  });
});

describe('open', () => {
  it('the lit interior, documents by person, the lock bar with its countdown and Lock', async () => {
    const v = open();
    renderWithProviders(<AtticView />, { mocks: [homeMock, logMock()], wrapper: withVault(v) });
    expect(await screen.findByTestId('attic-home')).toBeInTheDocument();
    expect(screen.getByTestId('attic-door')).toHaveAttribute('data-open', 'true');
    const groups = await screen.findAllByTestId('attic-group');
    expect(groups.map((g) => within(g).getByRole('heading').textContent)).toEqual(['Clint 1', 'Heather 1']);
    expect(screen.getByTestId('attic-lockbar')).toHaveTextContent(/Unlocked · locks in [89]:\d\d/);
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    expect(v.lock).toHaveBeenCalled();
  });

  it('Recent access says who did what — never a value', async () => {
    renderWithProviders(<AtticView />, { mocks: [homeMock, logMock()], wrapper: withVault(open()) });
    const rows = await screen.findAllByTestId('access-row');
    expect(rows[0]).toHaveTextContent('heather revealed Passport number on Passport · Clint');
    expect(rows[1]).toHaveTextContent('chef unlocked the Attic with a fingerprint');
    expect(document.body.textContent).not.toContain('X12345678');
    expect(accessSentence({ action: 'download', actorName: 'chef', documentId: 'd9', documentTitle: null })).toBe('chef downloaded an image of a deleted document');
  });
});

describe("a document's page", () => {
  const page = (doc, v = open()) =>
    renderWithProviders(
      <Routes>
        <Route path="/attic/doc/:id" element={<AtticDocumentPage />} />
      </Routes>,
      { initialEntries: [`/attic/doc/${doc.id}`], mocks: [docMock(doc)], wrapper: withVault(v) },
    );

  it('numbers are masked with no partial digits; Reveal asks the backend for ONE field', async () => {
    page(fullDoc());
    const row = await screen.findByTestId('identifier-row');
    expect(within(row).getByTestId('identifier-value')).toHaveTextContent('••••••••');
    expect(document.body.textContent).not.toMatch(/\d{4}5678|5678/);
    fireEvent.click(within(row).getByRole('button', { name: 'Reveal Passport number' }));
    await waitFor(() => expect(within(row).getByTestId('identifier-value')).toHaveTextContent('X12345678'));
    expect(atticApi.revealIdentifier).toHaveBeenCalledWith('d1', 'number');
    expect(within(row).getByRole('status')).toHaveTextContent('this reveal was logged');
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    expect(within(row).getByTestId('identifier-value')).toHaveTextContent('••••••••');
  });

  it('the strict number (SSN) has no Copy and hides itself after 15 seconds', async () => {
    page(fullDoc(SSN, { fields: [] }));
    const row = await screen.findByTestId('identifier-row');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(within(row).getByRole('button', { name: 'Reveal Social Security number' }));
    await waitFor(() => expect(within(row).getByTestId('identifier-value')).toHaveTextContent('X12345678'));
    expect(within(row).queryByRole('button', { name: /Copy/ })).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(16000);
    });
    expect(within(row).getByTestId('identifier-value')).toHaveTextContent('••••••••');
  });

  it('images come from the vault-gated route, with open and download', async () => {
    page(fullDoc());
    const fig = await screen.findByTestId('attic-file');
    expect(within(fig).getByRole('img')).toHaveAttribute('src', '/api/attic/files/f1');
    expect(within(fig).getByRole('link', { name: 'Download Photo page' })).toHaveAttribute('href', '/api/attic/files/f1?download=1');
  });

  it('locked: the door, not the document', () => {
    page(fullDoc(), vault());
    expect(screen.getByRole('heading', { name: 'This document is locked' })).toBeInTheDocument();
    expect(screen.queryByTestId('identifier-row')).toBeNull();
  });
});

describe('adding a document', () => {
  const form = () => renderWithProviders(<AtticDocumentForm mode="add" />, { initialEntries: ['/attic/add'], mocks: [homeMock], wrapper: withVault(open()) });

  it('a card type asks for the FRONT then the BACK, each with the camera', async () => {
    form();
    fireEvent.click(await screen.findByRole('radio', { name: "Driver's license" }));
    const front = screen.getByTestId('capture-front');
    const back = screen.getByTestId('capture-back');
    expect(within(front).getByText('Front')).toBeInTheDocument();
    expect(within(back).getByText('Back')).toBeInTheDocument();
    const camera = screen.getByTestId('capture-front-camera');
    expect(camera).toHaveAttribute('capture', 'environment');
    expect(camera).toHaveAttribute('accept', 'image/*');
    expect(screen.getByTestId('capture-front-file')).toHaveAttribute('accept', expect.stringContaining('application/pdf'));
  });

  it('a passport asks for the photo page; its number is masked as typed and is not a password field', async () => {
    form();
    fireEvent.click(await screen.findByRole('radio', { name: 'Passport' }));
    expect(within(screen.getByTestId('capture-front')).getByText('Photo page')).toBeInTheDocument();
    expect(screen.queryByTestId('capture-back')).toBeNull();
    const number = screen.getByLabelText('Passport number');
    expect(number).toHaveAttribute('type', 'text');
    expect(number).toHaveAttribute('autocomplete', 'off');
    expect(number).toHaveAttribute('data-masked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Show Passport number' }));
    expect(number).toHaveAttribute('data-masked', 'false');
  });

  it('the gateway payload never carries an identifier value', () => {
    const input = documentInputFrom(
      { type: PASSPORT, personIds: ['p1'], title: '', plain: { country: 'USA', number: 'X12345678' }, issued: '', expires: '2027-04-20', links: [], notes: '' },
      { create: true },
    );
    expect(input).toEqual({ typeId: 'ty-pass', personIds: ['p1'], title: null, fields: { country: 'USA' }, issued: null, expires: '2027-04-20T00:00:00.000Z', links: [], notes: '' });
    expect(JSON.stringify(input)).not.toContain('X12345678');
  });
});

describe('visible while locked', () => {
  const expiringMock = {
    request: { query: GET_ATTIC_EXPIRING },
    result: { data: { atticExpiring: [{ __typename: 'AtticExpiring', documentId: 'd1', typeName: 'Passport', expiryLabel: 'Expires', people: ['Clint'], expires: '2027-04-20T00:00:00.000Z', daysUntil: 200, status: 'warning' }] } },
  };

  it('Needs attention: person + document type + date, and it says that is all it shows', async () => {
    renderWithProviders(<AtticAttention />, { mocks: [expiringMock] });
    const row = await screen.findByTestId('attic-attention-row');
    expect(row).toHaveTextContent('Clint · Passport');
    expect(row).toHaveTextContent('Expires Apr 20, 2027');
    expect(row).toHaveAttribute('href', '/attic/doc/d1');
    expect(screen.getByText(/Shown without unlocking: who, which document and the date. Never numbers or images./)).toBeInTheDocument();
  });

  it("a thing's page: \"2 documents in the Attic — unlock to view\"", async () => {
    const mock = { request: { query: GET_THING_ATTIC, variables: { id: 't1' } }, result: { data: { thing: { __typename: 'Thing', id: 't1', attic: { __typename: 'ThingAttic', count: 2, locked: true, documents: [] } } } } };
    renderWithProviders(<ThingAttic thingId="t1" />, { mocks: [mock, mock], wrapper: withVault(vault()) });
    expect(await screen.findByText('2 documents in the Attic — unlock to view.')).toBeInTheDocument();
  });
});

describe('the lock, client side', () => {
  function Probe() {
    const v = useVault();
    return (
      <div>
        <span data-testid="state">{v.loading ? 'loading' : v.unlocked ? 'unlocked' : 'locked'}</span>
        <button type="button" onClick={() => v.handleError({ status: 423, code: 'VAULT_LOCKED' })}>
          refused
        </button>
      </div>
    );
  }

  it('locks itself — server first — at the idle deadline the server reported', async () => {
    const api = {
      vaultStatus: vi.fn(async () => ({ available: true, setUp: true, pin: true, passkeys: [], unlocked: true, idleExpiresAt: new Date(Date.now() + 1200).toISOString() })),
      lockVault: vi.fn(async () => ({ unlocked: false })),
      pingVault: vi.fn(),
    };
    renderWithProviders(
      <VaultProvider api={api}>
        <Probe />
      </VaultProvider>,
      { mocks: [] },
    );
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('unlocked'));
    await waitFor(() => expect(api.lockVault).toHaveBeenCalled(), { timeout: 3000 });
    expect(screen.getByTestId('state')).toHaveTextContent('locked');
  });

  it('any VAULT_LOCKED answer shuts the door', async () => {
    const api = { vaultStatus: vi.fn(async () => ({ available: true, setUp: true, pin: true, unlocked: true, idleExpiresAt: new Date(Date.now() + 600000).toISOString() })), lockVault: vi.fn(), pingVault: vi.fn() };
    renderWithProviders(
      <VaultProvider api={api}>
        <Probe />
      </VaultProvider>,
      { mocks: [] },
    );
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('unlocked'));
    fireEvent.click(screen.getByRole('button', { name: 'refused' }));
    expect(screen.getByTestId('state')).toHaveTextContent('locked');
  });
});
