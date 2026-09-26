/**
 * The Value filter: two whole-dollar fields, committed on blur or Enter (the
 * URL is not rewritten per keystroke). There is no value histogram in the
 * facets, so this is plain inputs rather than the collection's RangeFacet.
 */
import React, { useEffect, useState } from 'react';
import { Box, InputAdornment, TextField } from '@mui/material';

const toText = (n) => (n === null || n === undefined ? '' : String(n));

function parse(text) {
  const cleaned = String(text).replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Math.round(Number(cleaned));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function ValueRangeFacet({ min, max, onCommit }) {
  const [lo, setLo] = useState(toText(min));
  const [hi, setHi] = useState(toText(max));
  useEffect(() => setLo(toText(min)), [min]);
  useEffect(() => setHi(toText(max)), [max]);

  const commit = () => {
    let a = parse(lo);
    let b = parse(hi);
    if (a !== null && b !== null && a > b) [a, b] = [b, a];
    if (a !== (min ?? null) || b !== (max ?? null)) onCommit({ valueMin: a, valueMax: b });
    setLo(toText(a));
    setHi(toText(b));
  };
  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  };
  const field = (label, value, set) => (
    <TextField
      size="small"
      label={label}
      value={value}
      onChange={(e) => set(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      inputProps={{ inputMode: 'numeric', 'aria-label': `${label} value in dollars` }}
      InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
      sx={{ flex: 1, minWidth: 0 }}
    />
  );
  return (
    <Box sx={{ display: 'flex', gap: 1, px: 1, pt: 0.5, pb: 1 }}>
      {field('From', lo, setLo)}
      {field('To', hi, setHi)}
    </Box>
  );
}
