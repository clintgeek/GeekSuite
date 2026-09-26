/**
 * The filter UI's shared bits that are not components (kept apart so the
 * component files stay Fast-Refresh clean): the pill button shape, the count
 * and footer wording, and the remembered open/closed state of the sections.
 */
import { useCallback, useState } from 'react';
import { readPref, writePref } from '../internal/storage';

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

/** "124 games" (empty while the total is unknown). */
export function countText(total, noun) {
  if (total == null) return '';
  return `${total.toLocaleString()} ${total === 1 ? noun.one : noun.many}`;
}

/** The phone sheet's footer: "Show 124 games", "No games match". */
export function showLabel(total, noun) {
  if (total == null) return `Show ${noun.many}`;
  if (total === 0) return `No ${noun.many} match`;
  return `Show ${total.toLocaleString()} ${total === 1 ? noun.one : noun.many}`;
}

/**
 * Which sections are open — per viewer (localStorage `storageKey`), shared by
 * the desktop panel and the phone sheet. `defaults` lists the sections open
 * until the person closes them; the rest start closed.
 */
export function useSectionOpen(storageKey, defaults = {}) {
  const [open, setOpen] = useState(() => {
    const stored = readPref(storageKey, null);
    return stored && typeof stored === 'object' ? { ...defaults, ...stored } : defaults;
  });
  const toggle = useCallback(
    (id) => {
      setOpen((prev) => {
        const next = { ...prev, [id]: !prev[id] };
        writePref(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );
  return [open, toggle];
}
