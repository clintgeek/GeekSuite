/**
 * The Label Maker's own pieces: the Dymo tape, the phone tab bar and its More
 * sheet, and the library's phone-first default view.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import DymoTape, { tapeTilt } from '../../components/DymoTape';
import BottomTabs from '../../components/BottomTabs';
import { hidesTabBar, tabFor } from '../../components/navConfig';
import { initialLibraryView } from '../../views/LibraryView';
import { GET_THING_ATTENTION, GET_THING_PROFILE } from '../../graphql/queries';
import { mockViewport, renderWithProviders } from '../testUtils';
import { makeThing } from '../fixtures';

describe('DymoTape', () => {
  it('is real text, as typed; the uppercase and the emboss are CSS', () => {
    renderWithProviders(<DymoTape>Garage</DymoTape>);
    const tape = screen.getByTestId('dymo-tape');
    expect(tape.textContent).toBe('Garage');
    expect(tape.querySelector('img, svg, canvas')).toBeNull();
    const letters = tape.firstElementChild;
    expect(getComputedStyle(letters).textTransform).toBe('uppercase');
  });

  it('tilts at most 0.6°, the same way every time for the same name', () => {
    for (const name of ['Garage', 'House', 'Shelf 2', 'Van', 'Gun safe', 'A very long place name indeed', '']) {
      expect(Math.abs(tapeTilt(name))).toBeLessThanOrEqual(0.6);
      expect(tapeTilt(name)).toBe(tapeTilt(name));
    }
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
    expect(within(bar).getByRole('link', { name: 'Add a thing' })).toHaveAttribute('href', '/add');
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
    expect(tabFor('/attention')).toBe('attention');
    for (const p of ['/types', '/insurance', '/trash', '/settings']) expect(tabFor(p)).toBe('more');
    expect(hidesTabBar('/add')).toBe(true);
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
