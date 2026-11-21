import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '../../testUtils';
import { NarrationEntry } from '../../../components/play/TranscriptEntry';

// Review 2026-11-19: the screen-reader-only "The Game Master:" label used
// `width: 1` and `m: -1` in `sx` — that is 100% wide and a -4px spacing
// step, not a 1px box. The harness caught the same slip on StoryList.
describe('NarrationEntry — the speaker label for screen readers', () => {
  it('is a 1px clipped box, not as wide as the row', () => {
    render(
      <ThemeProvider theme={lightTheme}>
        <NarrationEntry message={{ type: 'ai', content: 'The mist parts.', timestamp: new Date(2026, 8, 1, 9) }} />
      </ThemeProvider>
    );
    const style = getComputedStyle(screen.getByText('The Game Master:'));
    expect(style.position).toBe('absolute');
    expect(style.width).toBe('1px');
    expect(style.height).toBe('1px');
    expect(style.margin).toBe('-1px');
  });
});
