import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createTheme } from '@mui/material/styles';
import { render } from '@testing-library/react';
import LabelQrCode from '../../components/LabelQrCode';

const toStringMock = vi.fn();

vi.mock('qrcode', () => ({
  default: {
    toString: (...args) => toStringMock(...args),
  },
}));

const theme = createTheme();
const renderQr = (props) => render(<ThemeProvider theme={theme}><LabelQrCode {...props} /></ThemeProvider>);

beforeEach(() => {
  toStringMock.mockReset();
});

describe('LabelQrCode', () => {
  it('asks the qrcode library to encode exactly the given value — nothing appended', async () => {
    toStringMock.mockResolvedValue('<svg data-value="https://thinggeek.clintgeek.com/thing/t-wendy"></svg>');
    renderQr({ value: 'https://thinggeek.clintgeek.com/thing/t-wendy', sizeMm: 20 });

    await screen.findByTestId('label-qr-svg');
    expect(toStringMock).toHaveBeenCalledTimes(1);
    const [value, opts] = toStringMock.mock.calls[0];
    expect(value).toBe('https://thinggeek.clintgeek.com/thing/t-wendy');
    expect(opts).toMatchObject({ type: 'svg' });
  });

  it('renders the library\'s SVG markup once resolved', async () => {
    toStringMock.mockResolvedValue('<svg data-value="https://thinggeek.clintgeek.com/thing/t-wendy"><path d="M0 0"/></svg>');
    renderQr({ value: 'https://thinggeek.clintgeek.com/thing/t-wendy' });

    const svgHost = await screen.findByTestId('label-qr-svg');
    expect(svgHost.innerHTML).toContain('https://thinggeek.clintgeek.com/thing/t-wendy');
    expect(svgHost.querySelector('svg')).toBeTruthy();
  });

  it('re-encodes when the value changes — never a stale, mismatched code', async () => {
    toStringMock.mockImplementation((value) => Promise.resolve(`<svg data-value="${value}"></svg>`));
    const { rerender } = renderQr({ value: 'https://thinggeek.clintgeek.com/thing/t-wendy' });
    await screen.findByTestId('label-qr-svg');

    rerender(<ThemeProvider theme={theme}><LabelQrCode value="https://thinggeek.clintgeek.com/thing/t-rifle" /></ThemeProvider>);
    await screen.findByTestId('label-qr-svg');
    expect(screen.getByTestId('label-qr-svg').innerHTML).toContain('t-rifle');
    expect(screen.getByTestId('label-qr-svg').innerHTML).not.toContain('t-wendy');
  });

  it('shows a plain failure note rather than crashing when encoding fails', async () => {
    toStringMock.mockRejectedValue(new Error('nope'));
    renderQr({ value: 'https://thinggeek.clintgeek.com/thing/t-wendy' });
    expect(await screen.findByText('QR failed')).toBeInTheDocument();
  });
});
