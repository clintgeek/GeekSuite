/**
 * Visual review A3: "working on it", "no signal" and "that didn't go
 * through" used to look identical — bold espresso, no icon. Each now carries
 * its own icon in its own colour; the words stay in the ink.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import ComposerBox from '../ComposerBox.jsx';
import { createFitnessTheme } from '../../../theme/theme.jsx';

const renderBox = (props) => render(
  <ThemeProvider theme={createFitnessTheme('light')}>
    <ComposerBox value="soup" onChange={() => {}} {...props} />
  </ThemeProvider>
);

describe('ComposerBox status line', () => {
  it.each([
    ['thinking', 'I’m working out the calories.'],
    ['offline', 'No signal.'],
    ['failure', 'That didn’t go through.'],
  ])('%s gets its own icon', (kind, text) => {
    renderBox({ status: text, statusKind: kind, statusTone: 'strong' });
    const line = screen.getByTestId('composer-status');
    expect(line).toHaveTextContent(text);
    expect(line.querySelector(`[data-testid="composer-status-${kind}"]`)).not.toBeNull();
    for (const other of ['thinking', 'offline', 'failure'].filter((k) => k !== kind)) {
      expect(line.querySelector(`[data-testid="composer-status-${other}"]`)).toBeNull();
    }
  });

  it('the resting helper has no icon', () => {
    renderBox({});
    expect(screen.getByTestId('composer-status').querySelector('svg')).toBeNull();
  });

  it('the thinking spinner is thick and in the button label colour', () => {
    renderBox({ thinking: true });
    const circle = screen.getByTestId('log-it').querySelector('.MuiCircularProgress-circle');
    expect(circle.getAttribute('stroke-width')).toBe('5');
  });
});
