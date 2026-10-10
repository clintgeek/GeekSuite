import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import HealthIndicator from '../../components/HealthIndicator';
import { createNewsTheme } from '../../theme/theme';
import { worstHealth } from '../../utils/health';

const CASES = [
  ['ok', 'OK'],
  ['stale', 'Stale'],
  ['failing', 'Failing'],
  ['broken', 'Broken'],
  ['never', 'Never fetched'],
];

describe('HealthIndicator', () => {
  it.each(CASES)('%s reads "%s", with its own glyph (never colour alone)', (health, label) => {
    const { container } = render(
      <ThemeProvider theme={createNewsTheme('light')}>
        <HealthIndicator health={health} />
      </ThemeProvider>
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    const root = container.querySelector('[data-health]');
    expect(root).toHaveAttribute('data-health', health);
    expect(root.querySelector('svg')).not.toBeNull();
  });

  it('every state draws a different glyph', () => {
    const paths = CASES.map(([health]) => {
      const { container, unmount } = render(
        <ThemeProvider theme={createNewsTheme('dark')}>
          <HealthIndicator health={health} />
        </ThemeProvider>
      );
      const d = container.querySelector('svg path').getAttribute('d');
      unmount();
      return d;
    });
    expect(new Set(paths).size).toBe(CASES.length);
  });

  it('an unknown value falls back to "Never fetched", not a blank', () => {
    render(
      <ThemeProvider theme={createNewsTheme('light')}>
        <HealthIndicator health="weird" />
      </ThemeProvider>
    );
    expect(screen.getByText('Never fetched')).toBeInTheDocument();
  });

  it('worstHealth picks the worst feed', () => {
    expect(worstHealth([{ health: 'ok' }, { health: 'failing' }, { health: 'stale' }])).toBe('failing');
    expect(worstHealth([{ health: 'ok' }, { health: 'broken' }])).toBe('broken');
    expect(worstHealth([])).toBe('never');
  });
});
