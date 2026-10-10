import React from 'react';
import { screen } from '@testing-library/react';
import PaywallBadge from '../../components/PaywallBadge';
import { source, walledSource } from '../fixtures';
import { renderWithProviders } from '../testUtils';

describe('PaywallBadge', () => {
  it('hard → "Paywall" with a lock mark', () => {
    renderWithProviders(<PaywallBadge source={walledSource('h', 'hard')} />);
    const badge = screen.getByTestId('paywall-badge');
    expect(badge).toHaveTextContent(/^Paywall$/);
    expect(badge.querySelector('svg')).not.toBeNull();
  });

  it('metered → "Metered"', () => {
    renderWithProviders(<PaywallBadge source={walledSource('m', 'metered')} />);
    expect(screen.getByTestId('paywall-badge')).toHaveTextContent(/^Metered$/);
  });

  it('none → nothing', () => {
    renderWithProviders(<PaywallBadge source={source('n')} />);
    expect(screen.queryByTestId('paywall-badge')).toBeNull();
  });
});
