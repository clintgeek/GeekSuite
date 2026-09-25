import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import ShelfSheet from '../../views/detail/ShelfSheet';
import { buildShelfList } from '../../hooks/useGameMeta';
import { renderWithProviders } from '../testUtils';

const shelves = buildShelfList([{ id: 'custom-couch-coop', label: 'Couch co-op' }]);

describe('ShelfSheet', () => {
  it('shows each built-in shelf’s meaning as a second line, and folds it into the accessible name', () => {
    renderWithProviders(
      <ShelfSheet open shelves={shelves} value="playing" onPick={vi.fn()} onClose={vi.fn()} gameTitle="Hades" />
    );

    expect(screen.getByText('Installed and ready to go')).toBeInTheDocument();
    expect(screen.getByText('Got what I wanted out of it — a restart would be a fresh start')).toBeInTheDocument();
    expect(screen.getByText('Abandoned is abandoned')).toBeInTheDocument();

    const playingRow = screen.getByRole('button', { name: 'Playing — Installed and ready to go' });
    expect(playingRow).toBeInTheDocument();
    expect(playingRow).toHaveAttribute('aria-pressed', 'true');
  });

  it('a custom shelf has no meaning line', () => {
    renderWithProviders(
      <ShelfSheet open shelves={shelves} value="playing" onPick={vi.fn()} onClose={vi.fn()} gameTitle="Hades" />
    );
    const customRow = screen.getByRole('button', { name: 'Couch co-op' });
    expect(customRow).toBeInTheDocument();
  });

  it('picking a shelf calls onPick with its id', () => {
    const onPick = vi.fn();
    renderWithProviders(
      <ShelfSheet open shelves={shelves} value="playing" onPick={onPick} onClose={vi.fn()} gameTitle="Hades" />
    );
    screen.getByRole('button', { name: /Finished/ }).click();
    expect(onPick).toHaveBeenCalledWith('finished');
  });
});
