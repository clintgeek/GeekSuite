/**
 * The printed insurance report: black on white, one block per thing, never
 * split across a page. Identifiers are UNMASKED here on purpose — this
 * document is for the insurer (the screen that prints it says so). Plain
 * elements with explicit print colours: nothing here depends on the app's
 * theme mode, so a dark-mode screen still prints a clean page.
 */
import React from 'react';
import { Box } from '@mui/material';
import { makeModel } from '../utils/attributes';
import { formatCalendarDate } from '../utils/dates';
import { hasReceipt } from '../utils/insuranceCsv';
import { formatMoney, moneyAmount } from '../utils/money';
import { placeLabel } from '../utils/places';
import { hasValue } from '../utils/identifiers';
import { coverSrc } from '../components/thingDisplay';

const INK = '#111111';
const GREY = '#444444';
const RULE = '#BBBBBB';
const FONT = '"Roboto", "Helvetica Neue", Arial, sans-serif';
const MONO = '"Roboto Mono", "SFMono-Regular", Menlo, Consolas, monospace';

function Fact({ label, children }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '80pt minmax(0, 1fr)', gap: '6px', fontSize: '10pt', lineHeight: 1.45 }}>
      <Box component="span" sx={{ color: GREY }}>{label}</Box>
      <Box component="span" sx={{ color: INK, minWidth: 0, overflowWrap: 'anywhere' }}>{children}</Box>
    </Box>
  );
}

export function PrintThing({ thing }) {
  const ids = (thing.fields ?? []).filter((f) => f.identifier && hasValue(f.value));
  const value = moneyAmount(thing.value);
  const price = moneyAmount(thing.acquired?.price);
  const src = coverSrc(thing);
  return (
    <Box
      component="article"
      data-testid="print-thing"
      sx={{ display: 'grid', gridTemplateColumns: { xs: '64pt minmax(0, 1fr)', sm: '84pt minmax(0, 1fr) 110pt' }, gap: '12pt', py: '10pt', borderBottom: `0.5pt solid ${RULE}`, breakInside: 'avoid', pageBreakInside: 'avoid' }}
    >
      <Box sx={{ width: { xs: '64pt', sm: '84pt' }, height: { xs: '64pt', sm: '84pt' }, border: `0.5pt solid ${RULE}`, overflow: 'hidden', display: 'grid', placeItems: 'center', color: GREY, fontSize: '9pt' }}>
        {src ? <Box component="img" src={src} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'No photo'}
      </Box>
      <Box>
        <Box sx={{ fontSize: '12pt', fontWeight: 700, color: INK, mb: '2pt' }}>{thing.name}</Box>
        <Fact label="Type">{thing.type?.name ?? '—'}</Fact>
        <Fact label="Make / model">{makeModel(thing.fields) || '—'}</Fact>
        {ids.map((f) => (
          <Fact key={f.key} label={f.label}>
            <Box component="span" data-testid="print-identifier" sx={{ fontFamily: MONO, letterSpacing: '0.02em' }}>
              {String(f.value)}
            </Box>
          </Fact>
        ))}
        {thing.place ? <Fact label="Kept at">{placeLabel(thing.place)}</Fact> : null}
        <Fact label="Acquired">
          {thing.acquired?.date ? formatCalendarDate(thing.acquired.date) : 'Unknown'}
          {price !== null ? ` · paid ${formatMoney(price, thing.acquired?.price?.currency)}` : ''}
          {thing.acquired?.from ? ` · from ${thing.acquired.from}` : ''}
        </Fact>
        <Fact label="On file">
          {(thing.photos ?? []).length} photo{(thing.photos ?? []).length === 1 ? '' : 's'} · {(thing.documents ?? []).length} document{(thing.documents ?? []).length === 1 ? '' : 's'} · receipt {hasReceipt(thing) ? '✓' : '—'}
        </Fact>
      </Box>
      <Box sx={{ textAlign: { xs: 'left', sm: 'right' }, gridColumn: { xs: '2', sm: 'auto' } }}>
        <Box sx={{ fontSize: '9pt', color: GREY, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Value</Box>
        <Box sx={{ fontSize: '13pt', fontWeight: 700, color: INK }}>{value !== null ? formatMoney(value, thing.value?.currency) : '—'}</Box>
        {thing.value?.asOf ? <Box sx={{ fontSize: '9pt', color: GREY }}>as of {formatCalendarDate(thing.value.asOf)}</Box> : null}
      </Box>
    </Box>
  );
}

export default function PrintReport({ things = [], totals, scopeText, generatedAt = new Date() }) {
  return (
    <Box data-testid="print-report" sx={{ fontFamily: FONT, color: INK, bgcolor: '#FFFFFF', p: 0, overflowWrap: 'anywhere' }}>
      <Box component="header" sx={{ borderBottom: `1.5pt solid ${INK}`, pb: '8pt', mb: '6pt' }}>
        <Box sx={{ fontSize: '18pt', fontWeight: 800 }}>Household inventory — insurance report</Box>
        <Box sx={{ fontSize: '10pt', color: GREY, mt: '2pt' }}>
          Prepared {generatedAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · {scopeText}
        </Box>
        {totals ? (
          <Box sx={{ fontSize: '10pt', mt: '4pt' }}>
            {totals.count} item{totals.count === 1 ? '' : 's'} · total value <b>{formatMoney(totals.totalValue, totals.currency)}</b> · {totals.withPhoto} with photos · {totals.withReceipt} with receipts · {totals.withSerial} with serials
          </Box>
        ) : null}
        <Box sx={{ fontSize: '9pt', color: GREY, mt: '4pt' }}>
          Serial numbers and other identifiers are printed in full for the insurer. Store this document securely.
        </Box>
      </Box>
      {things.map((t) => (
        <PrintThing key={t.id} thing={t} />
      ))}
    </Box>
  );
}
