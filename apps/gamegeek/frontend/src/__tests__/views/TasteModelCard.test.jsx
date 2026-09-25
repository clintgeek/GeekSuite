import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import TasteModelCard from '../../views/settings/TasteModelCard';
import { RATING_MEANINGS, SHELF_MEANINGS } from '../../utils/tasteModel';
import { renderWithProviders } from '../testUtils';

describe('TasteModelCard — the shelves & stars disclosure', () => {
  it('is collapsed by default', () => {
    renderWithProviders(<TasteModelCard />);
    const toggle = screen.getByRole('button', { name: 'What the shelves and stars mean' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(SHELF_MEANINGS.playing.full)).not.toBeInTheDocument();
  });

  it('lists every built-in shelf and every rating with the full quote, once expanded', () => {
    renderWithProviders(<TasteModelCard />);
    fireEvent.click(screen.getByRole('button', { name: 'What the shelves and stars mean' }));

    for (const meaning of Object.values(SHELF_MEANINGS)) {
      expect(screen.getByText(new RegExp(meaning.full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    }
    for (const meaning of Object.values(RATING_MEANINGS)) {
      expect(screen.getByText(new RegExp(meaning.full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    }
    expect(screen.getAllByText('provisional')).toHaveLength(2);
  });
});
