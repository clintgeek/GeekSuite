import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import RatingSection from '../../views/detail/RatingSection';
import { makeDetailGame } from '../fixtures';
import { renderWithProviders } from '../testUtils';

function stubSlider(slider) {
  slider.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 44, right: 100, bottom: 44 });
}

describe('RatingSection — the live meaning line', () => {
  it('shows nothing but "Not rated" when there is no rating and no hover', () => {
    const game = makeDetailGame({ me: { rating: null } });
    renderWithProviders(<RatingSection game={game} onRate={vi.fn()} />);
    expect(screen.getByText('Not rated')).toBeInTheDocument();
  });

  it('follows the current rating when not hovering', () => {
    const game = makeDetailGame({ me: { rating: 4 } });
    renderWithProviders(<RatingSection game={game} onRate={vi.fn()} />);
    expect(screen.getByText(/4 of 5 — Really liked it/)).toBeInTheDocument();
  });

  it('follows the hovered star while choosing, live (aria-live), then falls back once the pointer leaves', () => {
    const game = makeDetailGame({ me: { rating: 4 } });
    renderWithProviders(<RatingSection game={game} onRate={vi.fn()} />);
    const slider = screen.getByRole('slider');
    stubSlider(slider);

    expect(screen.getByText(/4 of 5/)).toHaveAttribute('aria-live', 'polite');

    fireEvent.pointerMove(slider, { pointerType: 'mouse', clientX: 5 });
    expect(screen.getByText(/1 of 5 — Hated it/)).toBeInTheDocument();

    fireEvent.pointerLeave(slider);
    expect(screen.getByText(/4 of 5 — Really liked it/)).toBeInTheDocument();
  });

  it('a keyboard commit changes the value, and the live line follows it', () => {
    const game = makeDetailGame({ me: { rating: 2 } });
    const onRate = vi.fn();
    const { rerender } = renderWithProviders(<RatingSection game={game} onRate={onRate} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onRate).toHaveBeenCalledWith(game, 3);

    rerender(<RatingSection game={makeDetailGame({ me: { rating: 3 } })} onRate={onRate} />);
    expect(screen.getByText(/3 of 5 — Well made, not my type/)).toBeInTheDocument();
  });
});
