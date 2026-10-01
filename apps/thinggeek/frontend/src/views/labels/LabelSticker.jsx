/**
 * One printable label — the unit both the screen preview and the print
 * portal render. Always black on white (it's a sticker, not a themed
 * screen): no `theme.palette` colours here, on purpose, mirroring
 * PrintReport.jsx's INK/GREY constants for the insurance report.
 *
 * `testIdPrefix` (default `label`, print uses `print-label`): the preview
 * grid and the print portal render the SAME things at the same time — the
 * print copy is only hidden by CSS (`@media print`), never removed from the
 * DOM — so without distinct prefixes `getByTestId('label-sticker')` would
 * match two elements at once. InsuranceView.jsx sidesteps this by using two
 * different components (`ReportRow` vs `PrintThing`) with their own testids;
 * this does the same thing with one component instead of two.
 *
 * `preview` (default false — the print portal never sets it): a label
 * printed at Small (38×25mm) has a footer that renders under 5px on a normal
 * screen — correct on paper, but unreadable, and it fails the suite's phone
 * text-floor (12px). The card and the QR stay their true physical mm size
 * either way (scaling Large's card up further would overflow a phone
 * viewport, and the true footprint is itself useful information); `preview`
 * only raises text to a 13px floor via CSS `max()`, never shrinking it.
 * Text that no longer fits truncates/wraps exactly as it does at the true
 * print size.
 *
 * Storage Yard: the sticker is laid out as a storage label — a heavy black
 * frame, and on Large the printed field captions a bin or shelf label
 * carries (CONTENTS over the name, LOCATION over where it lives). Still
 * black on white and nothing else: it's paper. Small keeps only the frame
 * (there's no room for captions at 38×25mm).
 */
import React from 'react';
import { Box } from '@mui/material';
import LabelQrCode from '../../components/LabelQrCode';
import { thingLabelUrl } from '../../utils/labelUrl';
import { whereLabel } from '../../utils/where';

const INK = '#000000';
const GREY = '#444444';
const FRAME = '#000000';

/**
 * Small: an Avery/label-roll cell. Large: a tote-front sticker, read from
 * across a garage — the name has to dominate it, not the QR (2026-09-29
 * review, then revised the same day: the QR's *box* had shrunk to fit its
 * new quiet zone, and the text block was top-aligned with dead space under
 * it — see the render below for both fixes).
 *
 * QR box sizes: `qrMm` is the WHOLE rendered box handed to LabelQrCode —
 * quiet zone included, per ISO/IEC 18004 (utils/qrGeometry.js). The
 * scannable DATA area left over after that zone depends on the QR's actual
 * module count (payload-length-dependent, not something this file picks),
 * so the LabelQrCode.quietZone/dataArea tests check it against the real
 * `qrcode` library rather than trusting these numbers by inspection:
 *   - Large: 48mm — "roughly the label height minus padding" on a 100×60mm
 *     label (56mm interior). Comfortably ≥25mm of data area for any
 *     realistic URL length.
 *   - Small: 20mm — the most a 38×25mm label's 21mm interior height can
 *     give a square box at all. Its data area is smaller (~15–17mm for a
 *     typical thing URL) but still real; there is no more mm to give it
 *     without shrinking the label itself.
 *
 * Small has no `breadcrumbFontPt`: at 38×25mm, with the QR already taking
 * 20mm of that width, a breadcrumb next to a name that's supposed to be the
 * biggest thing on the label doesn't fit legibly — it's dropped there (see
 * `LabelSticker` below), not just shrunk. Large keeps it, under the name.
 */
export const LABEL_SIZES = {
  small: { key: 'small', label: 'Small — 38 × 25mm (label roll)', widthMm: 38, heightMm: 25, qrMm: 20, footerFontPt: 3.5 },
  large: { key: 'large', label: 'Large — 100 × 60mm (tote front)', widthMm: 100, heightMm: 60, qrMm: 48, breadcrumbFontPt: 8, footerFontPt: 6 },
};

export const LABEL_SIZE_ORDER = ['small', 'large'];

const PREVIEW_TEXT_FLOOR = '13px';

/**
 * Large's name size: as big as legibly fits, stepped down deterministically
 * by character count rather than measured at render time — same name always
 * gets the same size, no ResizeObserver, no layout thrash, trivially
 * testable. Paired with a 2-line clamp (see below), so a name has to run
 * fairly long before it needs the smallest step.
 */
export const LARGE_NAME_STEPS = [
  { maxChars: 12, pt: 28 },
  { maxChars: 18, pt: 24 },
  { maxChars: 24, pt: 20 },
  { maxChars: 32, pt: 17 },
];
const LARGE_NAME_FLOOR_PT = 14;
const LARGE_NAME_LINE_CLAMP = 2;

export function largeNameFontPt(name) {
  const len = String(name ?? '').length;
  const step = LARGE_NAME_STEPS.find((s) => len <= s.maxChars);
  return fitLongestWord(name, step ? step.pt : LARGE_NAME_FLOOR_PT, textColumnMm(LABEL_SIZES.large), LARGE_NAME_FLOOR_PT);
}

/**
 * Small's name size: the same idea as Large, scaled to a card a fifth the
 * size. A truncated-to-one-word name ("Blue …") told Chef nothing standing
 * in front of a tote, so Small wraps up to 3 lines instead of 1 — ellipsis
 * only kicks in past that.
 */
export const SMALL_NAME_STEPS = [
  { maxChars: 8, pt: 11 },
  { maxChars: 16, pt: 9 },
  { maxChars: 28, pt: 7.5 },
];
const SMALL_NAME_FLOOR_PT = 6.5;
const SMALL_NAME_LINE_CLAMP = 3;

export function smallNameFontPt(name) {
  const len = String(name ?? '').length;
  const step = SMALL_NAME_STEPS.find((s) => len <= s.maxChars);
  return fitLongestWord(name, step ? step.pt : SMALL_NAME_FLOOR_PT, textColumnMm(LABEL_SIZES.small), SMALL_NAME_FLOOR_PT);
}

/**
 * Names are set in Barlow Condensed 700, which the app already self-hosts,
 * so print metrics are the same on every machine. Its widest common glyphs
 * run about 0.5em; sizing so the longest WORD fits the column at that width
 * means a name wraps between words ("Wendy" never becomes "Wend / y").
 */
const NAME_EM_PER_CHAR = 0.5;
const MM_PER_PT = 25.4 / 72;

export function textColumnMm(spec) {
  // padding 2mm each side, 2mm gap between the QR and the text
  return spec.widthMm - 4 - spec.qrMm - 2;
}

export function fitLongestWord(name, stepPt, columnMm, floorPt) {
  const longest = Math.max(1, ...String(name ?? '').split(/\s+/).map((w) => w.length));
  const fitPt = columnMm / (longest * NAME_EM_PER_CHAR * MM_PER_PT);
  return Math.max(floorPt, Math.min(stepPt, Math.floor(fitPt * 2) / 2));
}

/** A printed field caption (Large only): small caps, black, above its field. */
function Caption({ children, pt, sx }) {
  return (
    <Box data-testid="label-caption" sx={{ fontSize: pt(5.5), fontWeight: 700, color: INK, letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1, ...sx }}>
      {children}
    </Box>
  );
}

export default function LabelSticker({ thing, size = 'small', testIdPrefix = 'label', preview = false }) {
  const spec = LABEL_SIZES[size] ?? LABEL_SIZES.small;
  const isLarge = spec.key === 'large';
  const url = thingLabelUrl(thing.id);
  // Small drops the breadcrumb entirely (see LABEL_SIZES) — the name is the
  // one thing that has to read, and there isn't room for both at that size.
  const breadcrumb = isLarge ? whereLabel(thing) : null;
  const nameFontPt = isLarge ? largeNameFontPt(thing.name) : smallNameFontPt(thing.name);
  const lineClamp = isLarge ? LARGE_NAME_LINE_CLAMP : SMALL_NAME_LINE_CLAMP;
  const id = (suffix) => `${testIdPrefix}-${suffix}`;
  // On screen only: never let a print-sized pt value render smaller than a
  // legible floor. On paper (preview=false) the raw pt stands as designed.
  const pt = (n) => (preview ? `max(${n}pt, ${PREVIEW_TEXT_FLOOR})` : `${n}pt`);

  return (
    <Box
      component="article"
      data-testid={id('sticker')}
      data-thing-id={thing.id}
      data-size={spec.key}
      data-name-pt={nameFontPt}
      sx={{
        width: `${spec.widthMm}mm`,
        height: `${spec.heightMm}mm`,
        bgcolor: '#FFFFFF',
        color: INK,
        border: `${isLarge ? 1.5 : 1}pt solid ${FRAME}`,
        boxSizing: 'border-box',
        p: '2mm',
        display: 'grid',
        gridTemplateColumns: `${spec.qrMm}mm 1fr`,
        columnGap: '2mm',
        alignItems: 'center',
        overflow: 'hidden',
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
      }}
    >
      <LabelQrCode value={url} sizeMm={spec.qrMm} testId={id('qr')} />
      {/* The whole text column matches the QR's (taller, now) height via the
          grid row; name+breadcrumb are centred WITHIN it as their own group,
          with the footer a fixed small tag at the very bottom — not the
          other way around, which is what `mt: 'auto'` on the footer alone
          used to do (it ate all the free space itself, leaving the name
          pinned to the top with dead air underneath). */}
      <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.5mm' }}>
          {isLarge ? <Caption pt={pt}>Contents</Caption> : null}
          <Box
            data-testid={id('name')}
            title={thing.name}
            sx={{
              // A sticker's name: big, bold, condensed — the biggest thing on
              // the label, on purpose. Barlow Condensed ships with the app
              // (main.jsx), so print metrics don't depend on system fonts.
              fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif',
              fontWeight: 700,
              fontSize: pt(nameFontPt),
              lineHeight: 1.05,
              letterSpacing: '-0.01em',
              color: INK,
              // Wraps between words up to `lineClamp` lines; ellipsis only
              // past that. The font size is chosen so the longest word fits
              // (fitLongestWord); overflowWrap is only the last resort for a
              // single word too long even at the floor size.
              overflowWrap: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: lineClamp,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {thing.name}
          </Box>
          {breadcrumb ? <Caption pt={pt} sx={{ mt: '1.5mm', borderTop: `0.75pt solid ${FRAME}`, pt: '1mm' }}>Location</Caption> : null}
          {breadcrumb ? (
            <Box
              data-testid={id('breadcrumb')}
              title={breadcrumb}
              sx={{
                fontSize: pt(spec.breadcrumbFontPt),
                color: GREY,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {breadcrumb}
            </Box>
          ) : null}
        </Box>
        <Box
          data-testid={id('footer')}
          sx={{ fontSize: pt(spec.footerFontPt), color: GREY, letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          ThingGeek
        </Box>
      </Box>
    </Box>
  );
}
