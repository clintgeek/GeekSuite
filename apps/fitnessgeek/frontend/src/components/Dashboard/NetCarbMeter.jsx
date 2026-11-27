import React from 'react';
import { FactRow } from '../primitives';
import { ketoStatus } from '../../utils/ketoMath';

/**
 * NetCarbMeter — keto mode's net-carb line on the Today's Facts label.
 *
 * One fact row: **Net carbs** 12 g of 20 ……… 60%. Close to or over the cap
 * says so in words, in the row's inverse tag (no colour carries it alone).
 *
 * Props:
 *   consumed  — net carbs consumed today (number, default 0)
 *   limitG    — daily net-carb cap in grams (number, default 20)
 *   sx        — optional MUI sx override for the row
 */
const STATUS_WORDS = { over: 'Over your limit', approaching: 'Close to your limit' };

const NetCarbMeter = ({ consumed = 0, limitG = 20, sx }) => {
  const status = ketoStatus(consumed, limitG);
  const pct = limitG > 0 ? `${Math.round((consumed / limitG) * 100)}%` : '—';
  return (
    <FactRow
      name="Net carbs"
      amount={`${Math.round(consumed)} g`}
      of={`of ${limitG}`}
      tag={STATUS_WORDS[status] || null}
      percent={pct}
      sx={sx}
    />
  );
};

export default NetCarbMeter;
