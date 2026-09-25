/**
 * The filter UI's shared bits that are not components (kept apart so the
 * component files stay Fast-Refresh clean): the pill button shape, the count
 * and footer wording, the save-view default name, and the remembered
 * open/closed state of the sections.
 */
import { useCallback, useState } from 'react';
import { DEFAULT_OPEN } from '../../utils/facets';
import { readPref, writePref } from '../../utils/storage';

export const pillSx = {
  minHeight: 44,
  borderRadius: '999px',
  px: 1.5,
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: 'text.primary',
  borderColor: 'border',
  whiteSpace: 'nowrap',
  '&:hover': { borderColor: 'text.secondary', bgcolor: 'transparent' },
};

export function countText(total) {
  if (total == null) return '';
  return `${total.toLocaleString()} ${total === 1 ? 'game' : 'games'}`;
}

export function showLabel(total) {
  if (total == null) return 'Show games';
  if (total === 0) return 'No games match';
  return `Show ${total.toLocaleString()} ${total === 1 ? 'game' : 'games'}`;
}

/** A sensible default name for a saved view from its chips: "RPG · Steam", else the sort. */
export function suggestName(chips, sortLabel) {
  const words = chips.filter((c) => c.id !== 'q' && c.id !== 'tagMatch').slice(0, 3).map((c) => c.label);
  return words.length ? words.join(' · ') : sortLabel;
}

const OPEN_KEY = 'gamegeek.filterSections';

/** Which sections are open — per viewer, shared by the desktop panel and the phone sheet. */
export function useSectionOpen() {
  const [open, setOpen] = useState(() => {
    const stored = readPref(OPEN_KEY, null);
    return stored && typeof stored === 'object' ? { ...DEFAULT_OPEN, ...stored } : DEFAULT_OPEN;
  });
  const toggle = useCallback((id) => {
    setOpen((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      writePref(OPEN_KEY, next);
      return next;
    });
  }, []);
  return [open, toggle];
}
