import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import QRCode from 'qrcode';
import LabelQrCode from '../../components/LabelQrCode';
import { LABEL_SIZES } from '../../views/labels/LabelSticker';
import { qrDataAreaMm } from '../../utils/qrGeometry';

// A realistic thing URL: the deployed origin plus a Mongo ObjectId-length id.
// Module count (and so the quiet zone's actual mm footprint) depends on this
// length, not on anything LabelSticker/LabelQrCode choose.
const REALISTIC_URL = 'https://thinggeek.clintgeek.com/thing/665f1a2b3c4d5e6f7a8b9c0d1e2f3a4b';

// Deliberately does NOT mock 'qrcode' — this checks the real library's
// output, not a stand-in for it. ISO/IEC 18004 requires at least 4 modules
// of quiet zone on every side; a code printed flush to a cut edge scans
// unreliably. See utils/qrGeometry.js's QUIET_ZONE_MODULES.
const theme = createTheme();
const renderQr = (props) => render(<ThemeProvider theme={theme}><LabelQrCode {...props} /></ThemeProvider>);

describe('LabelQrCode — ISO quiet zone', () => {
  it('renders at least a 4-module quiet zone on every side, against the real qrcode library', async () => {
    const value = 'https://thinggeek.clintgeek.com/thing/t-wendy';
    renderQr({ value });

    const host = await screen.findByTestId('label-qr-svg');
    const svg = host.querySelector('svg');
    expect(svg).toBeTruthy();

    const viewBox = svg.getAttribute('viewBox');
    const [, , w, h] = viewBox.split(/\s+/).map(Number);
    expect(w).toBe(h); // the renderer always emits a square viewBox

    // The raw module grid, independent of the component under test, from the
    // same library — errorCorrectionLevel must match what the component uses
    // or the version (and so the module count) could differ.
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const quietZonePerSide = (w - modules.size) / 2;
    expect(quietZonePerSide).toBeGreaterThanOrEqual(4);
  });

  it('a longer, differently-shaped payload still gets the full quiet zone', async () => {
    const value = 'https://thinggeek.clintgeek.com/thing/665f1a2b3c4d5e6f7a8b9c0d1e2f3a4b';
    renderQr({ value });
    const host = await screen.findByTestId('label-qr-svg');
    const svg = host.querySelector('svg');
    const [, , w] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
    expect((w - modules.size) / 2).toBeGreaterThanOrEqual(4);
  });
});

describe('QR data area — the box minus the quiet zone, against the real library', () => {
  it('Large (qrMm=48): comfortably at least 25mm of scannable data, not just a bigger box', () => {
    const { modules } = QRCode.create(REALISTIC_URL, { errorCorrectionLevel: 'M' });
    const dataAreaMm = qrDataAreaMm(LABEL_SIZES.large.qrMm, modules.size);
    expect(dataAreaMm).toBeGreaterThanOrEqual(25);
  });

  it('Small (qrMm=20): the real data area for a 38×25mm label — reported honestly, not padded to pass', () => {
    const { modules } = QRCode.create(REALISTIC_URL, { errorCorrectionLevel: 'M' });
    const dataAreaMm = qrDataAreaMm(LABEL_SIZES.small.qrMm, modules.size);
    // 38×25mm's 21mm interior height is the most a square QR box can be
    // (LABEL_SIZES' comment); this is the true resulting data area for that
    // box against a realistic thing URL, not a threshold the box was sized
    // to just clear.
    expect(dataAreaMm).toBeGreaterThanOrEqual(15);
  });
});
