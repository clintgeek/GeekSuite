/**
 * "Daylight": Today follows the time of day (a sky wash on the hero, a sun
 * or moon by the date), and only on today.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { createFitnessTheme } from '../../../theme/theme.jsx';
import { phaseForHour, daylightFor } from '../daylight.js';
import DayHeader from '../DayHeader.jsx';
import WhatIsLeft from '../WhatIsLeft.jsx';

const wrap = (ui, mode = 'light') => render(
  <ThemeProvider theme={createFitnessTheme(mode)}><MemoryRouter>{ui}</MemoryRouter></ThemeProvider>
);

describe('the phase of the day', () => {
  it.each([
    [5, 'morning'], [10, 'morning'], [11, 'midday'], [16, 'midday'],
    [17, 'evening'], [20, 'evening'], [21, 'night'], [0, 'night'], [4, 'night'],
  ])('%i:00 is %s', (hour, phase) => {
    expect(phaseForHour(hour)).toBe(phase);
  });

  it('has its own colours in the dark', () => {
    expect(daylightFor(8, 'dark').wash).not.toBe(daylightFor(8, 'light').wash);
  });
});

describe('the day header', () => {
  const props = { today: '2026-11-27', greeting: 'Good evening, Chef', onPrevious() {}, onNext() {}, onToday() {} };

  it('puts the moon by today’s date at night', () => {
    wrap(<DayHeader {...props} day="2026-11-27" daylight={daylightFor(22)} />);
    expect(screen.getByTestId('sky-night')).toBeInTheDocument();
    expect(screen.getByTestId('day-header-date')).toHaveTextContent('Friday, November 27');
  });

  it('shows no sun or moon on another day', () => {
    wrap(<DayHeader {...props} day="2026-11-26" daylight={daylightFor(22)} />);
    expect(screen.queryByTestId('sky-night')).toBeNull();
  });
});

describe('what is left', () => {
  it('does not say "left today" a third time when there is room left', () => {
    wrap(<WhatIsLeft day="2026-11-27" today="2026-11-27" eaten={1680} goal={2340} headline="You have 660 calories left today" detail="1,680 eaten of 2,340" />);
    expect(screen.queryByText('Amount left today')).toBeNull();
    expect(screen.getByTestId('calories-sentence')).toHaveTextContent('You have 660 calories left today');
  });

  it('still says what the number is when over, or with no target', () => {
    const { unmount } = wrap(<WhatIsLeft day="2026-11-27" today="2026-11-27" eaten={2500} goal={2340} headline="You’re 160 calories over today" detail="" />);
    expect(screen.getByText('Over target today')).toBeInTheDocument();
    unmount();
    wrap(<WhatIsLeft day="2026-11-27" today="2026-11-27" eaten={500} goal={0} headline="You’ve had 500 calories" detail="" />);
    expect(screen.getByText('Eaten today')).toBeInTheDocument();
  });
});
