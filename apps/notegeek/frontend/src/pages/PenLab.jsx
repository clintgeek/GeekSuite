import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Typography, useTheme } from '@mui/material';
import { penButtonTool, TLDRAW_ERASER_BUTTON } from '../utils/penButton';

/**
 * PenLab — /labs/pen. What a pen actually sends the browser.
 *
 * Built 2026-11-14 because the Lenovo pen's button opens a Lenovo menu instead
 * of erasing (DOCS/HANDWRITING.md §1): nothing documents how Chrome on Android
 * reports each pen's buttons, so this shows it. Press, hold and drag in the
 * box, with and without the button; every pointer event that arrives is
 * listed with the fields `utils/penButton.js` reads (`pointerType`, `button`,
 * `buttons`), plus pressure and tilt. Key presses are listed too — a
 * Bluetooth pen button can arrive as a key. Nothing here is saved or sent.
 *
 * Not linked from anywhere: a diagnostic, reached by typing the address.
 */
const MAX_ROWS = 40;
const POINTER_EVENTS = ['pointerdown', 'pointerup', 'pointercancel', 'pointermove'];

function describePointer(e) {
  return {
    event: e.type,
    pointerType: e.pointerType,
    button: e.button,
    buttons: e.buttons,
    pressure: Number(e.pressure?.toFixed?.(2) ?? e.pressure),
    tiltX: e.tiltX,
    tiltY: e.tiltY,
    twist: e.twist,
    isPrimary: e.isPrimary,
  };
}

/**
 * What NoteGeek would do with this event — asked of penButton.js itself
 * (review 2.11), not a copy of its rules that could drift.
 *
 * Only a PRESS chooses a tool. A button pressed mid-stroke arrives as a
 * chorded pointermove, and nothing acts on it: the stroke carries on as ink
 * (HANDWRITING.md §1, "Not handled"). The lab used to call that "eraser".
 */
function verdict(row) {
  if (row.pointerType !== 'pen') return '';
  const e = { pointerType: row.pointerType, button: row.button, buttons: row.buttons };
  if (row.event !== 'pointerdown') {
    const chorded = row.event === 'pointermove' && penButtonTool({ ...e, button: -1 });
    return chorded ? 'nothing mid-stroke (lift, then press with the button)' : '';
  }
  if (row.button === TLDRAW_ERASER_BUTTON) return 'tldraw eraser (button 5)';
  const tool = penButtonTool(e);
  if (tool === 'eraser') return (row.buttons & 32) ? 'eraser (eraser bit)' : 'eraser (side button)';
  if (tool === 'hand') return 'scroll (second button)';
  return 'write';
}

export default function PenLab() {
  const theme = useTheme();
  const padRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [copied, setCopied] = useState(false);
  const lastMoveRef = useRef('');

  const push = useCallback((row) => {
    setRows((prev) => [{ ...row, at: new Date().toISOString().slice(11, 23) }, ...prev].slice(0, MAX_ROWS));
  }, []);

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return undefined;
    const onPointer = (e) => {
      const row = describePointer(e);
      if (e.type === 'pointermove') {
        // Moves flood the list: keep one only when the buttons change.
        const sig = `${row.pointerType}|${row.buttons}`;
        if (sig === lastMoveRef.current) return;
        lastMoveRef.current = sig;
      }
      push(row);
    };
    const onMenu = (e) => {
      e.preventDefault();
      push({ event: 'contextmenu', pointerType: e.pointerType || '(none)', button: e.button, buttons: e.buttons });
    };
    POINTER_EVENTS.forEach((t) => pad.addEventListener(t, onPointer));
    pad.addEventListener('contextmenu', onMenu);
    const onKey = (e) => push({ event: e.type, key: e.key, code: e.code });
    window.addEventListener('keydown', onKey);
    return () => {
      POINTER_EVENTS.forEach((t) => pad.removeEventListener(t, onPointer));
      pad.removeEventListener('contextmenu', onMenu);
      window.removeEventListener('keydown', onKey);
    };
  }, [push]);

  const copy = async () => {
    const report = { userAgent: navigator.userAgent, events: rows };
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const mono = { fontFamily: theme.typography.fontFamilyMono, wordSpacing: 'normal', fontSize: '0.75rem' };

  return (
    <Box sx={{ p: 4, maxWidth: 900, mx: 'auto' }}>
      <Typography component="h1" variant="h5" sx={{ mb: 1 }}>Pen lab</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Touch the box with the pen: tap, then hold the pen&apos;s button and drag, then press the button while hovering.
        Each event the browser receives is listed below, newest first. Nothing is saved.
      </Typography>

      <Box
        ref={padRef}
        role="application"
        aria-label="Pen test area"
        tabIndex={0}
        sx={{
          height: 220, borderRadius: 2, border: '2px dashed', borderColor: 'divider', mb: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', userSelect: 'none',
          bgcolor: 'action.hover',
        }}
      >
        <Typography variant="body2" color="text.secondary">Pen here</Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={copy} disabled={!rows.length} sx={{ textTransform: 'none', minHeight: 44 }}>
          Copy report
        </Button>
        <Button onClick={() => { setRows([]); setCopied(false); lastMoveRef.current = ''; }} disabled={!rows.length} sx={{ textTransform: 'none', minHeight: 44 }}>
          Clear
        </Button>
        <Typography role="status" variant="body2" color="text.secondary">
          {copied ? 'Copied — paste it to Sage.' : rows.length ? `${rows.length} events` : 'No events yet'}
        </Typography>
      </Box>

      <Box component="table" sx={{ ...mono, width: '100%', borderCollapse: 'collapse', '& td, & th': { textAlign: 'left', pr: 3, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' } }}>
        <thead>
          <tr>
            <th scope="col">time</th><th scope="col">event</th><th scope="col">type</th><th scope="col">button</th>
            <th scope="col">buttons</th><th scope="col">pressure</th><th scope="col">NoteGeek would</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.at}-${i}`}>
              <td>{r.at}</td>
              <td>{r.event}</td>
              <td>{r.pointerType ?? r.key}</td>
              <td>{r.button ?? r.code}</td>
              <td>{r.buttons}</td>
              <td>{r.pressure}</td>
              <td>{verdict(r)}</td>
            </tr>
          ))}
        </tbody>
      </Box>

      <Typography sx={{ ...mono, color: 'text.secondary', mt: 3, wordBreak: 'break-all' }}>{navigator.userAgent}</Typography>
    </Box>
  );
}
