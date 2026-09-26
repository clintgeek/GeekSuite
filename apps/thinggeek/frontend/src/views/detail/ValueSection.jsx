/** Value & purchase: what it's worth now (for the insurer) and how it came to us. */
import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import Section, { LedgerRow } from './Section';
import { DISPLAY_FONT } from '../../theme/theme';
import { formatCalendarDate } from '../../utils/dates';
import { formatMoney, moneyAmount } from '../../utils/money';

export default function ValueSection({ thing, onEdit }) {
  const value = moneyAmount(thing.value);
  const price = moneyAmount(thing.acquired?.price);
  const { date, from } = thing.acquired ?? {};
  const hasPurchase = Boolean(date || from || price !== null);

  return (
    <Section
      id="value"
      title="Value & purchase"
      action={
        <Button size="small" onClick={onEdit} sx={{ color: 'text.primary', fontWeight: 600 }}>
          Edit
        </Button>
      }
    >
      <Box sx={{ mb: hasPurchase ? 1.5 : 0 }}>
        {value !== null ? (
          <>
            <Typography sx={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: '1.75rem', lineHeight: 1.1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {formatMoney(value, thing.value?.currency)}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>
              Current value{thing.value?.asOf ? ` as of ${formatCalendarDate(thing.value.asOf)}` : ''}
            </Typography>
          </>
        ) : (
          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
            No value recorded yet. The insurance report totals whatever is here.
          </Typography>
        )}
      </Box>
      {hasPurchase ? (
        <Box>
          {date ? <LedgerRow label="Acquired">{formatCalendarDate(date)}</LedgerRow> : null}
          {from ? <LedgerRow label="From">{from}</LedgerRow> : null}
          {price !== null ? (
            <LedgerRow label="Paid">
              <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(price, thing.acquired?.price?.currency)}</Box>
            </LedgerRow>
          ) : null}
        </Box>
      ) : null}
    </Section>
  );
}
