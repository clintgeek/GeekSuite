/**
 * EmptyState — BuJoGeek's identity over the shared `GeekEmptyState`.
 *
 * The block used to be hand-rolled here; the structure (ornament → title →
 * description → action, with a real 44px target on the action) now lives in
 * `packages/ui` as `GeekEmptyState` (TODO_ORDER #15) and this file is only the
 * app's voice: left-aligned, the three-dot pause mark instead of an icon,
 * Fraunces italic for the title and Source Sans for the copy, all intentionally
 * quiet. Every prop passes through, so callers are unchanged.
 *
 * Reach for `GeekEmptyState` directly if a surface wants the suite's default
 * centered voice instead.
 */
import { GeekEmptyState } from '@geeksuite/ui';

/** The pause mark: three spaced dots where other apps put an icon. */
const PauseMark = () => (
  <span
    style={{
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: '0.5rem',
      letterSpacing: '0.45em',
      userSelect: 'none',
      lineHeight: 1,
    }}
  >
    · · ·
  </span>
);

const EmptyState = ({ icon, ...props }) => (
  <GeekEmptyState
    align="start"
    icon={icon === undefined ? <PauseMark /> : icon}
    // The ornament is decorative (aria-hidden), so it can sit below AA; the
    // title and description stay on `text.muted` and keep it. That is a
    // deliberate lift from the old hand-rolled version, which painted both at
    // rgba(...,0.2)–0.32 in dark mode and was barely legible.
    iconSx={{ opacity: 0.45, mb: 1.5 }}
    titleSx={{
      fontFamily: '"Fraunces", serif',
      fontSize: { xs: '1.0625rem', sm: '1.1875rem' },
      fontWeight: 300,
      fontStyle: 'italic',
      color: 'text.muted',
      lineHeight: 1.35,
      letterSpacing: '-0.01em',
      fontOpticalSizing: 'auto',
    }}
    descriptionSx={{
      fontFamily: '"Source Sans 3", sans-serif',
      fontSize: '0.8125rem',
      maxWidth: 380,
      lineHeight: 1.6,
    }}
    {...props}
  />
);

export default EmptyState;
