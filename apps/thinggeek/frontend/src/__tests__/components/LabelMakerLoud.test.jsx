/**
 * The Label Maker, made obvious (2026-09-30): struck-by-hand letters,
 * refill tones by meaning, headings on tape, the taped-up first run.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import DymoTape, { letterOffset } from '../../components/DymoTape';
import SectionTape from '../../components/SectionTape';
import { PlaceTape } from '../../components/ThingRow';
import OnboardingChecklist from '../../components/OnboardingChecklist';
import LibraryEmpty from '../../views/LibraryEmpty';
import { toneForKind } from '../../theme/theme';
import { crumbs, makeThing } from '../fixtures';
import { renderWithProviders } from '../testUtils';

describe('struck-by-hand letters', () => {
  it('each letter sits a hair off the line, the same way every time, and the text stays the name', () => {
    renderWithProviders(<DymoTape>Garage</DymoTape>);
    const tape = screen.getByTestId('dymo-tape');
    expect(tape.textContent).toBe('Garage');
    const letters = [...tape.firstElementChild.children];
    expect(letters.map((l) => l.textContent).join('')).toBe('Garage');
    const offsets = letters.map((l) => l.style.top);
    expect(new Set(offsets).size).toBeGreaterThan(1); // not all on the line
    for (let i = 0; i < 6; i += 1) {
      expect(Math.abs(letterOffset('Garage', i))).toBeLessThanOrEqual(0.03);
      expect(letterOffset('Garage', i)).toBe(letterOffset('Garage', i));
    }
  });
});

describe('refill tones', () => {
  it('a container is on blue tape, a location on black', () => {
    expect(toneForKind('container')).toBe('blue');
    expect(toneForKind('location')).toBe('black');
    expect(toneForKind(undefined)).toBe('black');
    // Van is a container (a vehicle type); Garage a location.
    renderWithProviders(<PlaceTape thing={makeThing({ path: crumbs('n-house', 'n-garage', 'n-van') })} />);
    expect(screen.getByTestId('dymo-tape')).toHaveAttribute('data-tone', 'blue');
  });

  it('a place directly in a location is on black tape', () => {
    renderWithProviders(<PlaceTape thing={makeThing({ path: crumbs('n-house', 'n-garage') })} />);
    expect(screen.getByTestId('dymo-tape')).toHaveAttribute('data-tone', 'black');
  });
});

describe('headings on tape', () => {
  it('is still a heading with its words; the count rides beside it', () => {
    renderWithProviders(
      <SectionTape id="x" tone="red" count={2}>
        Overdue
      </SectionTape>,
    );
    const h = screen.getByRole('heading', { level: 2 });
    expect(h).toHaveAttribute('id', 'x');
    expect(within(h).getByTestId('dymo-tape')).toHaveAttribute('data-tone', 'red');
    expect(h.textContent).toBe('Overdue2');
  });

  it('a finished checklist step gets green "Done" tape instead of its action', () => {
    renderWithProviders(<OnboardingChecklist locationsCount={5} itemsCount={0} missingIdPlate={0} />);
    const rooms = screen.getByTestId('checklist-step-rooms');
    expect(within(rooms).getByTestId('dymo-tape')).toHaveAttribute('data-tone', 'green');
    expect(within(rooms).queryByRole('link', { name: 'Add a room' })).toBeNull();
    const walk = screen.getByTestId('checklist-step-walk');
    expect(within(walk).queryByTestId('dymo-tape')).toBeNull();
  });
});

describe('the first run', () => {
  it('steps punched as tape, taped to the carton, and Add a thing on an orange strip that works', () => {
    const onAdd = vi.fn();
    renderWithProviders(<LibraryEmpty firstRun onAdd={onAdd} />);
    expect(screen.getAllByTestId('empty-step').map((s) => within(s).getByTestId('dymo-tape').textContent)).toEqual([
      '1 Take a photo',
      '2 Pick a type',
      '3 Say where it lives',
    ]);
    expect(screen.getByTestId('packing-tape')).toHaveAttribute('aria-hidden', 'true');
    const add = screen.getByRole('button', { name: 'Add a thing' });
    expect(within(add).getByTestId('dymo-tape')).toHaveAttribute('data-tone', 'orange');
    fireEvent.click(add);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
