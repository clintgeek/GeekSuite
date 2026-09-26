/**
 * An identifier field (serial, VIN, hull, registration) on screen: masked
 * to its last four ("••••1234") until someone asks to see it, with a
 * per-field Reveal toggle and a Copy button that copies the real value
 * without revealing it. The reveal lives in this component's state, so it
 * re-masks whenever the component unmounts or the thing changes (the parent
 * keys it by thing id) — navigating away always puts the mask back.
 */
import React, { useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { ContentCopy as CopyIcon, Visibility as RevealIcon, VisibilityOff as HideIcon } from '@mui/icons-material';
import { useToast } from '@geeksuite/ui';
import { MONO_FONT } from '../../theme/theme';
import { maskIdentifier } from '../../utils/identifiers';

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand?.('copy');
  area.remove();
  return Boolean(ok);
}

export function useIdentifierReveal() {
  const [revealed, setRevealed] = useState(() => new Set());
  const toggle = (key) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return { isRevealed: (key) => revealed.has(key), toggle };
}

export function IdentifierText({ value, revealed }) {
  const text = String(value ?? '');
  return (
    <Box
      component="span"
      data-testid="identifier-value"
      data-masked={revealed ? 'false' : 'true'}
      aria-label={revealed ? text : `Hidden, ends in ${text.slice(-4)}`}
      sx={{ fontFamily: MONO_FONT, fontSize: '0.9375rem', letterSpacing: revealed ? '0.02em' : '0.08em', color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}
    >
      {revealed ? text : maskIdentifier(text)}
    </Box>
  );
}

export function IdentifierActions({ label, value, revealed, onToggle }) {
  const { notify } = useToast();
  const copy = async () => {
    try {
      const ok = await copyText(String(value));
      notify(ok ? `${label} copied.` : "Couldn't copy — reveal it and copy by hand.", { tone: ok ? 'success' : 'warning' });
    } catch {
      notify("Couldn't copy — reveal it and copy by hand.", { tone: 'warning' });
    }
  };
  return (
    <>
      <Tooltip title={revealed ? 'Hide' : 'Reveal'}>
        <IconButton onClick={onToggle} aria-label={`${revealed ? 'Hide' : 'Reveal'} ${label}`} aria-pressed={revealed ? 'true' : 'false'} sx={{ color: 'text.secondary' }}>
          {revealed ? <HideIcon fontSize="small" /> : <RevealIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Tooltip title="Copy">
        <IconButton onClick={copy} aria-label={`Copy ${label}`} sx={{ color: 'text.secondary' }}>
          <CopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );
}
