/**
 * The Storage Yard's own pieces (2026-10-01): the unit tag and its crumbs,
 * murals and unit numbers, the record-check gauge, the phone tab bar (Add in
 * the middle) and its More sheet, the library's phone-first default view,
 * the first run and the "Getting started" checklist.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import UnitTag, { captionForKind, labelTilt } from '../../components/UnitTag';
import LabelCrumbs from '../../components/LabelCrumbs';
import BottomTabs from '../../components/BottomTabs';
import TruckMural from '../../components/TruckMural';
import { PlaceLabel } from '../../components/ThingRow';
import OnboardingChecklist from '../../components/OnboardingChecklist';
import { hidesTabBar, tabFor } from '../../components/navConfig';
import LibraryEmpty from '../../views/LibraryEmpty';
import { initialLibraryView } from '../../views/LibraryView';
import { recordCheckPercent } from '../../views/AttentionView';
import { muralMotif, unitNumber } from '../../utils/mural';
import { GET_THING_ATTENTION, GET_THING_PROFILE } from '../../graphql/queries';
import { mockViewport, renderWithProviders } from '../testUtils';
import { crumbs, makeThing } from '../fixtures';

describe('the unit tag', () => {
  it('is real text, exactly the name; no box marking by default, the strip is plain colour', () => {
    renderWithProviders(<UnitTag kind="container">Gun safe</UnitTag>);
    const tag = screen.getByTestId('unit-tag');
    expect(tag.textContent).toBe('Gun safe');
    expect(screen.getByText('Gun safe')).toBeInTheDocument();
    expect(tag).toHaveAttribute('data-kind', 'container');
    expect(tag).toHaveAttribute('data-caption', '');
    const strip = tag.querySelector('[data-caption]:not([data-testid])');
    expect(strip).toHaveAttribute('aria-hidden', 'true');
    expect(strip.textContent).toBe('');
    expect(tag.querySelector('img, svg, canvas')).toBeNull();
  });

  it('a caption can be asked for (FOR RENT), and stays out of the text; a mural names the kind in plain words', () => {
    renderWithProviders(<UnitTag caption="FOR RENT">First unit</UnitTag>);
    const tag = screen.getByTestId('unit-tag');
    expect(tag).toHaveAttribute('data-caption', 'FOR RENT');
    expect(tag.textContent).toBe('First unit');
    expect(captionForKind('location')).toBe('LOCATION');
    expect(captionForKind('container')).toBe('CONTAINER');
    expect(captionForKind(undefined)).toBe('LOCATION');
  });

  it('is stuck on at most 1° off straight, the same way every time', () => {
    for (const name of ['Garage', 'House', 'Shelf 2', 'Van', 'A very long place name indeed', '']) {
      expect(Math.abs(labelTilt(name))).toBeLessThanOrEqual(1);
      expect(labelTilt(name)).toBe(labelTilt(name));
    }
  });

  it("a row's place is a plain tag with the last crumb — no TO: caption — the whole walk as its title", () => {
    renderWithProviders(<PlaceLabel thing={makeThing({ path: crumbs('n-house', 'n-garage', 'n-van') })} />);
    const label = screen.getByTestId('unit-tag');
    expect(label).toHaveTextContent(/^Van$/);
    expect(label).toHaveAttribute('data-caption', '');
    expect(label).toHaveAttribute('data-kind', 'container');
    expect(label).toHaveAttribute('title', 'House › Garage › Van');
  });
});

describe('label crumbs', () => {
  it('each place a link on its tag, its kind kept as data, in order', () => {
    renderWithProviders(<LabelCrumbs path={crumbs('n-house', 'n-garage', 'n-van')} />);
    const nav = screen.getByRole('navigation', { name: 'Where it is' });
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['House', '/thing/n-house'],
      ['Garage', '/thing/n-garage'],
      ['Van', '/thing/n-van'],
    ]);
    expect(within(nav).getAllByTestId('unit-tag').map((l) => l.getAttribute('data-kind'))).toEqual(['location', 'location', 'container']);
    expect(nav.textContent).not.toMatch(/ROOM|BOX|TO:/);
  });
});

describe('murals and unit numbers (utils/mural.js)', () => {
  it('a keyword picks the motif; anything else is the open road', () => {
    expect(muralMotif('Garage')).toBe('garage');
    expect(muralMotif('Boat garage')).toBe('garage');
    expect(muralMotif('Kitchen pantry')).toBe('kitchen');
    expect(muralMotif('Master bedroom')).toBe('bedroom');
    expect(muralMotif("Dad's workshop")).toBe('workshop');
    expect(muralMotif('Attic')).toBe('attic');
    expect(muralMotif('Hall closet')).toBe('closet');
    expect(muralMotif('Wendy', 'Boat')).toBe('boat');
    expect(muralMotif('Somewhere else')).toBe('road');
  });

  it('a unit number is a row letter and two digits, stable per name', () => {
    for (const name of ['Garage', 'House', 'Shelf 2', 'Gun safe']) {
      expect(unitNumber(name)).toMatch(/^[A-H]-\d{2}$/);
      expect(unitNumber(name)).toBe(unitNumber(name));
    }
  });

  it("the mural's name is real text and can be the page's heading; the scene is decoration", () => {
    renderWithProviders(<TruckMural name="Garage" caption="LOCATION" headingProps={{ component: 'h1', id: 'thing-name' }} />);
    const h = screen.getByRole('heading', { level: 1, name: 'Garage' });
    expect(h).toHaveAttribute('id', 'thing-name');
    const mural = screen.getByTestId('truck-mural');
    expect(mural).toHaveAttribute('data-motif', 'garage');
    expect(mural.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('the record-check gauge', () => {
  it('photo, receipt and value on file over three checks per inventory thing; nothing recorded is no reading', () => {
    expect(recordCheckPercent(null, 5)).toBeNull();
    expect(recordCheckPercent({ missingPhoto: 0, missingReceipt: 0, missingValue: 0 }, 0)).toBeNull();
    expect(recordCheckPercent({ missingPhoto: 0, missingReceipt: 0, missingValue: 0 }, 4)).toBe(100);
    expect(recordCheckPercent({ missingPhoto: 5, missingReceipt: 10, missingValue: 2 }, 16)).toBe(65);
    expect(recordCheckPercent({ missingPhoto: 4, missingReceipt: 4, missingValue: 4 }, 4)).toBe(0);
  });
});

const many = (m) => ({ ...m, maxUsageCount: 20 });
const attentionMock = (overdue = [], dueSoon = []) =>
  many({
    request: { query: GET_THING_ATTENTION },
    result: { data: { thingAttention: { __typename: 'ThingAttention', overdue, dueSoon, missingIdPlate: 0, missingReceipt: 0, missingSerial: 0, missingValue: 0, missingPhoto: 0 } } },
  });
const profileMock = many({ request: { query: GET_THING_PROFILE }, result: { data: { thingProfile: null } } });

describe('the phone tab bar', () => {
  it('Things · Where · Add · Attention · More, Add in the middle, the current tab marked', async () => {
    renderWithProviders(<BottomTabs />, { initialEntries: ['/where'], mocks: [attentionMock(), profileMock] });
    const bar = screen.getByRole('navigation', { name: 'Tabs' });
    const tabs = [...bar.querySelectorAll('[data-tab]')].map((el) => el.getAttribute('data-tab'));
    expect(tabs).toEqual(['things', 'where', 'add', 'attention', 'more']);
    // Add says what it does, and its visible word is in its name.
    const add = within(bar).getByRole('link', { name: 'Add a thing' });
    expect(add).toHaveAttribute('href', '/add');
    expect(add).toHaveTextContent('Add');
    expect(within(bar).getByRole('link', { name: 'Where' })).toHaveAttribute('aria-current', 'page');
    expect(within(bar).getByRole('link', { name: 'Things' })).not.toHaveAttribute('aria-current');
  });

  it('Attention carries the count of things overdue or due soon', async () => {
    const overdue = [makeThing({ id: 'a' })];
    const dueSoon = [makeThing({ id: 'b' }), makeThing({ id: 'c' })];
    renderWithProviders(<BottomTabs />, { mocks: [attentionMock(overdue, dueSoon), profileMock] });
    expect(await screen.findByRole('link', { name: 'Needs attention, 3 due' })).toBeInTheDocument();
    expect(screen.getByTestId('attention-badge')).toHaveTextContent('3');
  });

  it('More opens the rest: Types, Insurance report, the Attic, Trash, Settings', async () => {
    renderWithProviders(<BottomTabs />, { mocks: [attentionMock(), profileMock] });
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const more = await screen.findByTestId('nav-more');
    expect(within(more).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/types', '/insurance', '/attic', '/trash', '/settings']);
  });

  it('every route lights one tab; the add screen hides the bar (it has its own Save bar)', () => {
    expect(tabFor('/')).toBe('things');
    expect(tabFor('/thing/t1')).toBe('things');
    expect(tabFor('/where')).toBe('where');
    expect(tabFor('/walk')).toBe('where');
    expect(tabFor('/attention')).toBe('attention');
    for (const p of ['/types', '/insurance', '/trash', '/settings', '/attic', '/attic/doc/d1', '/attic/add']) expect(tabFor(p)).toBe('more');
    expect(hidesTabBar('/add')).toBe(true);
    expect(hidesTabBar('/walk')).toBe(true);
    expect(hidesTabBar('/')).toBe(false);
  });
});

describe("the library's default view", () => {
  let restore = () => {};
  afterEach(() => {
    restore();
    try {
      window.localStorage.clear();
    } catch {
      /* none */
    }
  });

  it('a phone starts on the dense list; a desk on the grid', () => {
    restore = mockViewport(390);
    expect(initialLibraryView()).toBe('list');
    restore();
    restore = mockViewport(1280);
    expect(initialLibraryView()).toBe('grid');
  });

  it('a choice made is remembered over the default', () => {
    restore = mockViewport(390);
    window.localStorage.setItem('thinggeek.libraryView', JSON.stringify('grid'));
    expect(initialLibraryView()).toBe('grid');
  });
});

describe('the first run: your storage', () => {
  it('the three steps, the row of doors as decoration, and the big Add button that works', () => {
    const onAdd = vi.fn();
    const { container } = renderWithProviders(<LibraryEmpty firstRun onAdd={onAdd} />);
    expect(screen.getByRole('heading', { name: 'Everything you own, in one place.' })).toBeInTheDocument();
    expect(screen.getAllByTestId('empty-step').map((s) => within(s).getByRole('heading').textContent)).toEqual(['Take a photo', 'Pick a type', 'Say where it lives']);
    expect(screen.getByTestId('empty-doors')).toHaveAttribute('aria-hidden', 'true');
    // Storage, not moving day: none of the moving-prep words anywhere on it.
    expect(container.textContent).not.toMatch(/moving|load|pack|truck|dock/i);
    fireEvent.click(screen.getByRole('button', { name: 'Add your first thing' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByTestId('empty-room')).toHaveLength(0);
  });

  it("Chef's shape — rooms set up, nothing in them: each room is a unit that opens Walk the room", () => {
    const rooms = [
      { id: 'r-garage', name: 'Garage', kind: 'location' },
      { id: 'r-kitchen', name: 'Kitchen', kind: 'location' },
    ];
    renderWithProviders(<LibraryEmpty firstRun onAdd={() => {}} rooms={rooms} />);
    expect(screen.getByText(/2 rooms are set up and empty/)).toBeInTheDocument();
    const links = screen.getAllByTestId('empty-room');
    expect(links.map((a) => [a.getAttribute('aria-label'), a.getAttribute('href')])).toEqual([
      ['Walk Garage', '/walk?at=r-garage'],
      ['Walk Kitchen', '/walk?at=r-kitchen'],
    ]);
    expect(within(links[0]).getByTestId('unit-tag')).toHaveTextContent('Garage');
  });

  it('nothing matching is a different sentence, with a way back and a way to add', () => {
    const onClear = vi.fn();
    renderWithProviders(<LibraryEmpty onAdd={() => {}} onClear={onClear} />);
    expect(screen.getByRole('heading', { name: 'Nothing matches' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }));
    expect(onClear).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add a thing' })).toBeInTheDocument();
  });
});

describe('Getting started', () => {
  it('is a heading of its own; a finished step is stamped Done instead of its action', () => {
    renderWithProviders(<OnboardingChecklist locationsCount={5} itemsCount={0} missingIdPlate={0} />);
    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeInTheDocument();
    const rooms = screen.getByTestId('checklist-step-rooms');
    expect(within(rooms).getByTestId('done-stamp')).toHaveTextContent('Done');
    expect(within(rooms).queryByRole('link', { name: 'Add a room' })).toBeNull();
    const walk = screen.getByTestId('checklist-step-walk');
    expect(within(walk).queryByTestId('done-stamp')).toBeNull();
    expect(within(walk).getByRole('button', { name: 'Walk a room' })).toBeInTheDocument();
  });
});
