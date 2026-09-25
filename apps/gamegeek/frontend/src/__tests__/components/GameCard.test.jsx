import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import GameCard from '../../components/GameCard';
import { makeGame } from '../fixtures';
import { renderWithProviders } from '../testUtils';

describe('GameCard', () => {
  it('shows the cover image when the game has one', () => {
    renderWithProviders(<GameCard game={makeGame({ coverUrl: '/api/games/g1/cover?v=1' })} onOpen={() => {}} />);
    expect(screen.getByTestId('game-cover-img')).toHaveAttribute('src', '/api/games/g1/cover?v=1');
    expect(screen.queryByTestId('title-plate')).not.toBeInTheDocument();
  });

  it('draws a title plate when there is no cover, with the title and platform on it', () => {
    renderWithProviders(<GameCard game={makeGame({ coverUrl: null })} onOpen={() => {}} />);
    const plate = screen.getByTestId('title-plate');
    expect(plate).toHaveTextContent('Hades');
    expect(plate).toHaveTextContent('Switch');
    expect(plate).toHaveTextContent('2020');
    expect(screen.queryByTestId('game-cover-img')).not.toBeInTheDocument();
  });

  it('falls back to the plate when the cover fails to load', () => {
    renderWithProviders(<GameCard game={makeGame({ coverUrl: '/broken' })} onOpen={() => {}} />);
    fireEvent.error(screen.getByTestId('game-cover-img'));
    expect(screen.getByTestId('title-plate')).toBeInTheDocument();
  });

  it('shows meta, platform chips, hours and shelf; opens on tap', () => {
    const onOpen = vi.fn();
    renderWithProviders(<GameCard game={makeGame()} onOpen={onOpen} onRate={() => {}} />);
    expect(screen.getByText('2020 · Supergiant Games')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Platforms' })).toHaveTextContent('Switch');
    expect(screen.getByText('22.5 h')).toBeInTheDocument();
    expect(screen.getByText('Playing')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hades' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1' }));
  });

  it('does not invite a rating on a backlog game', () => {
    renderWithProviders(
      <GameCard game={makeGame({ me: { shelf: 'backlog', rating: null, hoursPlayed: 0 } })} onOpen={() => {}} onRate={() => {}} />
    );
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
