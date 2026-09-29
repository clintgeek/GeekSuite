/**
 * A QR code rendered client-side as an SVG (crisp at any print size, unlike
 * a raster PNG). Nothing about this ever leaves the device: the `qrcode`
 * package encodes `value` locally, no web API involved.
 *
 * QUIET_ZONE_MODULES (see utils/qrGeometry.js): the ISO/IEC 18004 minimum —
 * 4 modules of plain white on every side of the code, INSIDE the label's cut
 * edge. The `qrcode` library's `margin` option is in modules and bakes the
 * zone directly into the SVG's own viewBox (see
 * node_modules/qrcode/lib/renderer/svg-tag.js), so the box this component is
 * given (`sizeMm`) already contains it — no separate padding needed here. A
 * scanner reads unreliably on a code cut flush to an edge, which is exactly
 * what `margin: 0` used to ship. `sizeMm` has to be picked generously enough
 * that the DATA area left over after the quiet zone is still a real,
 * scannable size — see LabelSticker.jsx's LABEL_SIZES and qrGeometry.js's
 * `qrDataAreaMm`.
 */
import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import QRCode from 'qrcode';
import { QUIET_ZONE_MODULES } from '../utils/qrGeometry';

export default function LabelQrCode({ value, sizeMm = 25, testId = 'label-qr', sx }) {
  const [svg, setSvg] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    QRCode.toString(value, { type: 'svg', margin: QUIET_ZONE_MODULES, errorCorrectionLevel: 'M' })
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <Box
      data-testid={testId}
      role="img"
      aria-label={`QR code linking to ${value}`}
      sx={{
        width: `${sizeMm}mm`,
        height: `${sizeMm}mm`,
        flexShrink: 0,
        bgcolor: '#FFFFFF',
        display: 'block',
        '& svg': { width: '100%', height: '100%', display: 'block' },
        ...sx,
      }}
    >
      {svg ? (
        <Box data-testid={`${testId}-svg`} sx={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : failed ? (
        <Box sx={{ fontSize: '6pt', color: '#900' }}>QR failed</Box>
      ) : null}
    </Box>
  );
}
