import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import Masthead from '../../components/Masthead';
import { createNewsTheme } from '../../theme/theme';
import { mastheadDate } from '../../utils/dates';

// vitest runs this suite with TZ=UTC: a machine-zone or UTC "today" would say Sunday.
describe('the masthead date is America/Chicago', () => {
  afterEach(() => vi.useRealTimers());

  it('at 2026-10-11T03:00Z it is still Saturday, October 10 in Arkadelphia', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-11T03:00:00Z'));
    render(
      <ThemeProvider theme={createNewsTheme('light')}>
        <Masthead />
      </ThemeProvider>
    );
    expect(screen.getByTestId('masthead-date')).toHaveTextContent('Saturday, October 10, 2026');
    expect(screen.getByRole('heading', { level: 1, name: 'NewsGeek' })).toBeInTheDocument();
  });

  it('turns over at Chicago midnight, not UTC midnight', () => {
    expect(mastheadDate(new Date('2026-10-11T04:59:00Z'))).toBe('Saturday, October 10, 2026');
    expect(mastheadDate(new Date('2026-10-11T05:00:00Z'))).toBe('Sunday, October 11, 2026');
    // Standard time (CST, UTC-6) after November 1.
    expect(mastheadDate(new Date('2026-12-01T05:30:00Z'))).toBe('Monday, November 30, 2026');
  });
});
