import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import QuickActions from '../../components/home/QuickActions';
import { renderWithProviders } from '../testUtils';

describe('QuickActions', () => {
  it('renders the three actions, each at the 44px touch-target floor', () => {
    renderWithProviders(<QuickActions />);

    const buttons = [
      screen.getByRole('link', { name: /log eggs/i }),
      screen.getByRole('link', { name: /add bird/i }),
      screen.getByRole('link', { name: /create group/i }),
    ];

    expect(buttons).toHaveLength(3);
    buttons.forEach((button) => {
      expect(getComputedStyle(button).minHeight).toBe('44px');
    });
  });

  it('routes each action to its page', () => {
    renderWithProviders(<QuickActions />);

    expect(screen.getByRole('link', { name: /log eggs/i })).toHaveAttribute('href', '/egg-log');
    expect(screen.getByRole('link', { name: /add bird/i })).toHaveAttribute('href', '/birds');
    expect(screen.getByRole('link', { name: /create group/i })).toHaveAttribute('href', '/groups');
  });
});
