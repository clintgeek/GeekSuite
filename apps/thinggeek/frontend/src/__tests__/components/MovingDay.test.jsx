/**
 * Moving Day's own pieces (2026-10-01): the moving label and its crumbs, box
 * markings, murals and unit numbers, the load-check gauge, the phone tab
 * bar (Load in the middle) and its More sheet, the library's phone-first
 * default view, the first run and the "Before you roll" checklist.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import MovingLabel, { captionForKind, labelTilt } from '../../components/MovingLabel';
import LabelCrumbs from '../../components/LabelCrumbs';
import BottomTabs from '../../components/BottomTabs';
import TruckMural from '../../components/TruckMural';
import { PlaceLabel } from '../../components/ThingRow';
import OnboardingChecklist from '../../components/OnboardingChecklist';
import { hidesTabBar, tabFor } from '../../components/navConfig';
import LibraryEmpty from '../../views/LibraryEmpty';
import { initialLibraryView } from '../../views/LibraryView';
import { loadCheckPercent } from '../../views/AttentionView';
import { boxSizeFor, careMarkFor } from '../../utils/boxMarks';
import { muralMotif, unitNumber } from '../../utils/mural';
import { GET_THING_ATTENTION, GET_THING_PROFILE } from '../../graphql/queries';
import { mockViewport, renderWithProviders } from '../testUtils';
import { crumbs, makeThing } from '../fixtures';

describe('the moving label', () => {
  it('is real text, exactly the name; the caption is a box marking outside the text', () => {
    renderWithProviders(<MovingLabel kind="container">Gun safe</MovingLabel>);
    const label = screen.getByTestId('moving-label');
    expect(label.textContent).toBe('Gun safe');
    expect(screen.getByText('Gun safe')).toBeInTheDocument();
    expect(label).toHaveAttribute('data-caption', 'BOX');
    const strip = label.querySelector('[data-caption]:not([data-testid])');
    expect(strip).toHaveAttribute('aria-hidden', 'true');
    expect(strip.textContent).toBe('');
    expect(label.querySelector('img, svg, canvas')).toBeNull();
  });

  it('a location is a ROOM, a container a BOX; any caption can be asked for', () => {
    expect(captionForKind('location')).toBe('ROOM');
    expect(captionForKind('container')).toBe('BOX');
    expect(captionForKind(undefined)).toBe('ROOM');
    renderWithProviders(<MovingLabel caption="TO">Garage</MovingLabel>);
    expect(screen.getByTestId('moving-label')).toHaveAttribute('data-caption', 'TO');
  });

  it('is slapped on at most 1° off straight, the same way every time', () => {
    for (const name of ['Garage', 'House', 'Shelf 2', 'Van', 'A very long place name indeed', '']) {
      expect(Math.abs(labelTilt(name))).toBeLessThanOrEqual(1);
      expect(labelTilt(name)).toBe(labelTilt(name));
    }
  });

  it("a row's place is a TO: label with the last crumb, the whole walk as its title, captioned by kind", () => {
    renderWithProviders(<PlaceLabel thing={makeThing({ path: crumbs('n-house', 'n-garage', 'n-van') })} />);
    const label = screen.getByTestId('moving-label');
    expect(label).toHaveTextContent(/^Van$/);
    expect(label).toHaveAttribute('data-caption', 'TO');
    expect(label).toHaveAttribute('data-kind', 'container');
    expect(label).toHaveAttribute('title', 'House › Garage › Van');
  });
});

describe('label crumbs', () => {
  it('each place a link on its label, ROOM or BOX by kind, in order', () => {
    renderWithProviders(<LabelCrumbs path={crumbs('n-house', 'n-garage', 'n-van')} />);
    const nav = screen.getByRole('navigation', { name: 'Where it is' });
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['House', '/thing/n-house'],
      ['Garage', '/thing/n-garage'],
      ['Van', '/thing/n-van'],
    ]);
    expect(within(nav).getAllByTestId('moving-label').map((l) => l.getAttribute('data-caption'))).toEqual(['ROOM', 'ROOM', 'BOX']);
  });
});

describe('box markings (utils/boxMarks.js)', () => {
  const type = (key, name, icon, kind = 'item') => ({ __typename: 'ThingType', id: `t-${key}`, key, name, icon, kind });

  it('vehicles and boats are OVERSIZE; a location has no box at all', () => {
    expect(boxSizeFor({ kind: 'container', type: type('boat', 'Boat', 'DirectionsBoat', 'container') })).toBe('OVERSIZE');
    expect(boxSizeFor({ kind: 'container', type: type('vehicle', 'Vehicle', 'DirectionsCar', 'container') })).toBe('OVERSIZE');
    expect(boxSizeFor({ kind: 'location', type: type('location', 'Location', 'Place', 'location') })).toBeNull();
  });

  it('a container by how much is inside it: 0–3 small, 4–11 medium, 12+ large', () => {
    const safe = (n) => ({ kind: 'container', childCount: n, type: type('storage', 'Storage', 'AllInbox', 'container') });
    expect([0, 3, 4, 11, 12, 40].map((n) => boxSizeFor(safe(n)))).toEqual(['SMALL', 'SMALL', 'MEDIUM', 'MEDIUM', 'LARGE', 'LARGE']);
  });

  it('an item by its type: appliances large; tools, electronics, firearms medium; the rest small', () => {
    expect(boxSizeFor({ kind: 'item', type: type('appliance', 'Appliance', 'Kitchen') })).toBe('LARGE');
    expect(boxSizeFor({ kind: 'item', type: type('tool', 'Tool', 'Handyman') })).toBe('MEDIUM');
    expect(boxSizeFor({ kind: 'item', type: type('firearm', 'Firearm', 'GpsFixed') })).toBe('MEDIUM');
    expect(boxSizeFor({ kind: 'item', type: type('general', 'General', 'Inventory2') })).toBe('SMALL');
  });

  it('FRAGILE for electronics and cameras; firearms get HANDLE WITH CARE and nothing else', () => {
    expect(careMarkFor({ kind: 'item', type: type('electronics', 'Electronics', 'Devices') })).toBe('FRAGILE');
    expect(careMarkFor({ kind: 'item', type: type('camera', 'Camera', 'PhotoCamera') })).toBe('FRAGILE');
    expect(careMarkFor({ kind: 'item', type: type('firearm', 'Firearm', 'GpsFixed') })).toBe('HANDLE WITH CARE');
    expect(careMarkFor({ kind: 'item', type: type('tool', 'Tool', 'Handyman') })).toBeNull();
    expect(careMarkFor({ kind: 'location', type: type('location', 'Location', 'Place', 'location') })).toBeNull();
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
    renderWithProviders(<TruckMural name="Garage" caption="ROOM" headingProps={{ component: 'h1', id: 'thing-name' }} />);
    const h = screen.getByRole('heading', { level: 1, name: 'Garage' });
    expect(h).toHaveAttribute('id', 'thing-name');
    const mural = screen.getByTestId('truck-mural');
    expect(mural).toHaveAttribute('data-motif', 'garage');
    expect(mural.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('the load-check gauge', () => {
  it('photo, receipt and value on file over three checks per inventory thing; nothing loaded is no reading', () => {
    expect(loadCheckPercent(null, 5)).toBeNull();
    expect(loadCheckPercent({ missingPhoto: 0, missingReceipt: 0, missingValue: 0 }, 0)).toBeNull();
    expect(loadCheckPercent({ missingPhoto: 0, missingReceipt: 0, missingValue: 0 }, 4)).toBe(100);
    expect(loadCheckPercent({ missingPhoto: 5, missingReceipt: 10, missingValue: 2 }, 16)).toBe(65);
    expect(loadCheckPercent({ missingPhoto: 4, missingReceipt: 4, missingValue: 4 }, 4)).toBe(0);
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
  it('Things · Where · Load · Attention · More, Load in the middle, the current tab marked', async () => {
    renderWithProviders(<BottomTabs />, { initialEntries: ['/where'], mocks: [attentionMock(), profileMock] });
    const bar = screen.getByRole('navigation', { name: 'Tabs' });
    const tabs = [...bar.querySelectorAll('[data-tab]')].map((el) => el.getAttribute('data-tab'));
    expect(tabs).toEqual(['things', 'where', 'add', 'attention', 'more']);
    // Load says what it does, and its visible word is in its name.
    const load = within(bar).getByRole('link', { name: 'Load: add a thing' });
    expect(load).toHaveAttribute('href', '/add');
    expect(load).toHaveTextContent('Load');
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

  it('More opens the rest: Types, Insurance report, Trash, Settings', async () => {
    renderWithProviders(<BottomTabs />, { mocks: [attentionMock(), profileMock] });
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const more = await screen.findByTestId('nav-more');
    expect(within(more).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/types', '/insurance', '/trash', '/settings']);
  });

  it('every route lights one tab; the add screen hides the bar (it has its own Save bar)', () => {
    expect(tabFor('/')).toBe('things');
    expect(tabFor('/thing/t1')).toBe('things');
    expect(tabFor('/where')).toBe('where');
    expect(tabFor('/walk')).toBe('where');
    expect(tabFor('/attention')).toBe('attention');
    for (const p of ['/types', '/insurance', '/trash', '/settings']) expect(tabFor(p)).toBe('more');
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

describe('the first run: the loading dock', () => {
  it('the three steps, the boxes as decoration, and the big Load button that works', () => {
    const onAdd = vi.fn();
    renderWithProviders(<LibraryEmpty firstRun onAdd={onAdd} />);
    expect(screen.getByRole('heading', { name: 'Moving day starts here' })).toBeInTheDocument();
    expect(screen.getAllByTestId('empty-step').map((s) => within(s).getByRole('heading').textContent)).toEqual(['Take a photo', 'Pick a type', 'Say where it lives']);
    for (const box of screen.getAllByTestId('empty-box')) expect(box).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Load your first thing' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByTestId('empty-room')).toHaveLength(0);
  });

  it("Chef's shape — rooms set up, nothing in them: each room is a label that packs it", () => {
    const rooms = [
      { id: 'r-garage', name: 'Garage', kind: 'location' },
      { id: 'r-kitchen', name: 'Kitchen', kind: 'location' },
    ];
    renderWithProviders(<LibraryEmpty firstRun onAdd={() => {}} rooms={rooms} />);
    expect(screen.getByText(/2 rooms are set up and empty/)).toBeInTheDocument();
    const links = screen.getAllByTestId('empty-room');
    expect(links.map((a) => [a.getAttribute('aria-label'), a.getAttribute('href')])).toEqual([
      ['Pack Garage', '/walk?at=r-garage'],
      ['Pack Kitchen', '/walk?at=r-kitchen'],
    ]);
    expect(within(links[0]).getByTestId('moving-label')).toHaveTextContent('Garage');
  });

  it('nothing matching is a different sentence, with a way back and a way to load', () => {
    const onClear = vi.fn();
    renderWithProviders(<LibraryEmpty onAdd={() => {}} onClear={onClear} />);
    expect(screen.getByRole('heading', { name: 'Nothing matches' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }));
    expect(onClear).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Load a thing' })).toBeInTheDocument();
  });
});

describe('Before you roll', () => {
  it('is a heading of its own; a finished step is stamped Done instead of its action', () => {
    renderWithProviders(<OnboardingChecklist locationsCount={5} itemsCount={0} missingIdPlate={0} />);
    expect(screen.getByRole('heading', { name: 'Before you roll' })).toBeInTheDocument();
    const rooms = screen.getByTestId('checklist-step-rooms');
    expect(within(rooms).getByTestId('done-stamp')).toHaveTextContent('Done');
    expect(within(rooms).queryByRole('link', { name: 'Add a room' })).toBeNull();
    const walk = screen.getByTestId('checklist-step-walk');
    expect(within(walk).queryByTestId('done-stamp')).toBeNull();
    expect(within(walk).getByRole('button', { name: 'Pack a room' })).toBeInTheDocument();
  });
});

describe('a truck or boat in the yard', () => {
  it('is labelled OVERSIZE, not BOX', async () => {
    const { isOversize } = await import('../../utils/boxMarks');
    expect(isOversize({ kind: 'container', type: { name: 'Vehicle', icon: 'DirectionsCar', kind: 'container' } })).toBe(true);
    expect(isOversize({ kind: 'container', type: { name: 'Storage', icon: 'Inventory2', kind: 'container' } })).toBe(false);
  });
});
