import React, { useEffect, useRef } from 'react';
import { Box, ButtonBase, Typography, useTheme } from '@mui/material';
import { GeekSheet } from '@geeksuite/ui';
import { NOTE_TEMPLATES } from '../../utils/noteTemplates';
import { graphiteTokens } from '../../theme/tokens';
import { TEMPLATE_ICONS, TEMPLATE_FALLBACK_ICON } from './templateIcons';

/**
 * TemplateList — the eight note templates (DOCS/TEMPLATES_SPEC.md N1) as
 * rows: glyph, name, one line of what the page holds. The same rows as the
 * New sheet's entries, so the picker reads as part of New.
 *
 * Keyboard (N5): every row is a button (Tab, Enter, Space); Up/Down, Home
 * and End also move between rows. `autoFocus` puts the caret on the first
 * row when the list appears inside a surface that is already open.
 */
export function TemplateList({ onPick, autoFocus = false }) {
  const theme = useTheme();
  const g = graphiteTokens(theme);
  const listRef = useRef(null);

  const rows = () => Array.from(listRef.current?.querySelectorAll('[data-template]') || []);

  useEffect(() => {
    if (autoFocus) rows()[0]?.focus({ preventScroll: true });
  }, [autoFocus]);

  const onKeyDown = (e) => {
    const all = rows();
    const at = all.indexOf(document.activeElement);
    if (at < 0) return;
    let next = null;
    if (e.key === 'ArrowDown') next = all[(at + 1) % all.length];
    else if (e.key === 'ArrowUp') next = all[(at - 1 + all.length) % all.length];
    else if (e.key === 'Home') next = all[0];
    else if (e.key === 'End') next = all[all.length - 1];
    if (!next) return;
    e.preventDefault();
    next.focus();
  };

  return (
    <Box
      ref={listRef}
      role="list"
      aria-label="Templates"
      data-template-list
      onKeyDown={onKeyDown}
      sx={{ display: 'flex', flexDirection: 'column', gap: '4px', pb: '8px' }}
    >
      {NOTE_TEMPLATES.map((template) => {
        const Icon = TEMPLATE_ICONS[template.id] || TEMPLATE_FALLBACK_ICON;
        return (
          <Box role="listitem" key={template.id}>
            <ButtonBase
              data-template={template.id}
              onClick={() => onPick(template.id)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '12px',
                width: '100%',
                minHeight: 56,
                px: '12px',
                py: '8px',
                borderRadius: '8px',
                textAlign: 'left',
                color: 'text.primary',
                '&:hover': { bgcolor: g.paper },
                '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: 2 },
              }}
            >
              <Icon aria-hidden sx={{ fontSize: 22, color: 'text.secondary', flexShrink: 0 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', color: 'inherit', lineHeight: 1.3 }}>
                  {template.label}
                </Typography>
                <Typography component="div" sx={{ fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.35 }}>
                  {template.description}
                </Typography>
              </Box>
            </ButtonBase>
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * TemplatePicker — the list on its own surface, for desktop's New menu: a
 * `GeekSheet` (a centred dialog at this width, a bottom sheet if the window
 * is narrow), so Esc and Android Back close it like every other sheet.
 * The phone and the tablet rail show the same list inside the New sheet
 * (NewNoteSheet.jsx) instead of stacking a second sheet on it.
 */
export function TemplatePicker({ open, onClose, onPick }) {
  return (
    <GeekSheet open={open} onClose={onClose} title="From a template" initialFocus="[data-template]">
      <TemplateList onPick={onPick} />
    </GeekSheet>
  );
}

export default TemplateList;
