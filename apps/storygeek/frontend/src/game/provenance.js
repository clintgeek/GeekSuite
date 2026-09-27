/**
 * Provenance of a canon fact: who put it in the record (DOCS/CONTINUITY.md,
 * "Canonical state"). `wax` names a WAX colour in theme.js; `glyph` says
 * whether the seal's initial is the light or the dark ink on that wax.
 */
export const PROVENANCE = {
  player: { label: 'You', initial: 'Y', wax: 'player', glyph: 'light' },
  narrator: { label: 'Narrator', initial: 'N', wax: 'narrator', glyph: 'dark' },
  setup: { label: 'Opening', initial: 'O', wax: 'setup', glyph: 'light' },
};
const RECORDED = { label: 'Record', initial: 'R', wax: 'recorded', glyph: 'light' };

export function provenanceOf(source) {
  return PROVENANCE[source] || RECORDED;
}

// Tier -> tone for a d20 result. The tone inks are measured per mode in
// theme.js (>= 5:1 on the page), so the result reads on its own 6% wash.
export function diceTone(result) {
  if (result === 20) return 'warn';
  if (result === 1) return 'bad';
  if (result >= 15) return 'good';
  if (result >= 10) return 'neutral';
  if (result >= 5) return 'warn';
  return 'bad';
}
