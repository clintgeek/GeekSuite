import { describe, it, expect, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuiteMap from '../../signalbox/SuiteMap';
import { renderWithProviders, mockMatchMediaMatches } from '../testUtils';

const APPS = ['noteGeek', 'todoGeek', 'bookGeek'].map((displayName) => ({
  name: displayName.toLowerCase(),
  displayName,
  url: `https://${displayName.toLowerCase()}.example`,
  description: `${displayName} description`,
}));

const HEALTHY = {
  notegeek: { online: true, latency: 40, version: '1.0.0' },
  todogeek: { online: true, latency: 41 },
  bookgeek: { online: true, latency: 42 },
};

let restore;
afterEach(() => restore?.());

function renderMap(health) {
  return renderWithProviders(<SuiteMap apps={APPS} health={health} services={[]} serviceStatus={{}} />);
}

describe('SuiteMap on a phone', () => {
  it('folds an all-green line into a summary and a yard of nameboards, cards one tap away', async () => {
    restore = mockMatchMediaMatches(true);
    renderMap(HEALTHY);
    expect(screen.getByText('All 3 stations online')).toBeInTheDocument();
    // Still the launcher: every station is a link.
    expect(screen.getByRole('link', { name: /Open noteGeek \(online, 40ms · v1.0.0\)/ })).toBeInTheDocument();
    // The cards' descriptions are not drawn.
    expect(screen.queryByText('noteGeek description')).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Show details' }));
    expect(screen.getByText('noteGeek description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compact view' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps the full card for a station that is not green', () => {
    restore = mockMatchMediaMatches(true);
    renderMap({ ...HEALTHY, bookgeek: { online: false } });
    expect(screen.getByText('2 online · 1 needs a look')).toBeInTheDocument();
    expect(screen.getByText('bookGeek description')).toBeInTheDocument();
    expect(screen.queryByText('noteGeek description')).toBeNull();
  });
});

describe('SuiteMap on desktop', () => {
  it('draws every station as its full card, with no summary toggle', () => {
    restore = mockMatchMediaMatches(false);
    renderMap(HEALTHY);
    expect(screen.getByText('noteGeek description')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show details' })).toBeNull();
  });
});
