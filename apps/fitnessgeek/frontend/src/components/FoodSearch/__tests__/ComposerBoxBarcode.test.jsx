/**
 * Review 2026-11-27: "Scan a barcode" was a text link under everything, off
 * the screen once there were chips. It is a round button beside the mic now,
 * the same size and ring, at every width — and Log it never changes into a
 * different-looking button while she types.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import ComposerBox from '../ComposerBox.jsx';
import { createFitnessTheme } from '../../../theme/theme.jsx';

const renderBox = (props) => render(
  <ThemeProvider theme={createFitnessTheme('light')}>
    <ComposerBox value="" onChange={() => {}} {...props} />
  </ThemeProvider>
);

describe('ComposerBox: the barcode button', () => {
  it('sits beside the mic, named "Scan a barcode", the same size', () => {
    const onBarcodeClick = vi.fn();
    renderBox({ onBarcodeClick, onMicClick: vi.fn() });
    const scan = screen.getByRole('button', { name: 'Scan a barcode' });
    const mic = screen.getByRole('button', { name: 'Say what you ate' });
    expect(scan.parentElement).toBe(mic.parentElement);
    for (const side of ['width', 'height', 'borderRadius']) {
      expect(getComputedStyle(scan)[side]).toBe(getComputedStyle(mic)[side]);
    }
    expect(getComputedStyle(scan).width).toBe('52px');
    fireEvent.click(scan);
    expect(onBarcodeClick).toHaveBeenCalledTimes(1);
  });

  it('is there with words in the box too, and off while a write is in flight', () => {
    const onBarcodeClick = vi.fn();
    const { rerender } = renderBox({ value: 'fage', onBarcodeClick });
    expect(screen.getByRole('button', { name: 'Scan a barcode' })).toBeEnabled();
    rerender(
      <ThemeProvider theme={createFitnessTheme('light')}>
        <ComposerBox value="fage" onChange={() => {}} onBarcodeClick={onBarcodeClick} barcodeDisabled />
      </ThemeProvider>
    );
    expect(screen.getByRole('button', { name: 'Scan a barcode' })).toBeDisabled();
  });

  it('is not drawn where there is no scanner to open', () => {
    renderBox({});
    expect(screen.queryByRole('button', { name: 'Scan a barcode' })).toBeNull();
  });
});

describe('ComposerBox: Log it keeps its identity', () => {
  it.each(['', 'fage', 'two eggs and toast'])('filled "Log it" for %j', (value) => {
    renderBox({ value });
    const button = screen.getByTestId('log-it');
    expect(button).toHaveTextContent(/^Log it$/);
    expect(button.className).toMatch(/MuiButton-contained/);
  });
});
