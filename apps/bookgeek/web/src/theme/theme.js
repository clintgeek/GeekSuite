/**
 * BookGeek Theme: "Used Bookstore" (2026-09-30; replaced "Midnight Reader").
 *
 * Chef: "too 'library' and not enough 'half price books'". The books were
 * never the problem — the cover-as-a-book work (BookCover: square boards, a
 * spine crease, cloth boards, the bookmark ribbon) and the DM Serif titles
 * stay exactly as they were. What changed is the STORE around them:
 *
 *   - a painted green signboard for the top bar, cream lettering on it;
 *   - wood shelves: on the library grid every row of covers stands on a
 *     plank (components/ShelfPlank.jsx);
 *   - hand-lettered shelf talkers (components/ShelfTalker.jsx, Caveat) — the
 *     only handwriting in the app;
 *   - one round price sticker, for what's waiting on the e-reader
 *     (components/PriceSticker.jsx);
 *   - aisle signs for the shelf strip and the sidebar's section labels;
 *   - a bargain-bin crate for the empty states.
 *
 * Neighbours it must not copy (DOCS/CONTEXT.md → Visual identity): ThingGeek
 * owns kraft cardboard and tape, StoryGeek candlelit parchment, GameGeek tilted
 * neon stickers. So: wood and warm white paper, never kraft or aged paper; the
 * price sticker is round, matte and never tilted.
 *
 * Dark mode is "after hours": the same store under one lamp — the wood goes
 * dark, the signboard stays green, the lamp is a soft pool at the top.
 *
 * Contrast: the chrome, sticker and talker pairs are measured in
 * __tests__/theme/usedBookstoreContrast.test.js; the shared surfaces by
 * packages/ui themeContrast.
 */
import { alpha } from '@mui/material/styles';
import { createGeekSuiteTheme } from '@geeksuite/ui';

export const SERIF_FONT = '"DM Serif Display", Georgia, serif';
export const BODY_FONT = '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
/** The shelf talkers' handwriting. Nowhere else. */
export const HAND_FONT = '"Caveat", "Segoe Print", "Bradley Hand", cursive';

/**
 * Bookstore green — the signboard, the links, the contained buttons. MUI's
 * primary. Light mode is the painted board itself; dark mode lifts it to a
 * readable green on the after-hours floor.
 */
const greenLight = { main: '#1E5B43', light: '#2F7458', dark: '#154533', contrastText: '#FFFDF6' };
const greenDark = { main: '#86C9A6', light: '#A5D8BC', dark: '#6BB38D', contrastText: '#10231B' };
const accentFor = (mode) => (mode === 'dark' ? greenDark : greenLight);

/**
 * page     the store: warm white paper by day, the dark floor after hours
 * surface  sheets, dialogs, the sidebar
 * card     a card on the page
 * raised   a pressed-in well (inputs, the filter panel's controls)
 */
export const SURFACES = {
  light: {
    page: '#F7F2E8',
    surface: '#FFFDF8',
    card: '#FFFDF8',
    raised: '#EFE7D8',
    text: '#221B14',
    secondary: '#54483B',
    muted: '#62564A',
    divider: 'rgba(34, 27, 20, 0.12)',
    border: 'rgba(34, 27, 20, 0.5)',
  },
  dark: {
    page: '#17130F',
    surface: '#201A15',
    card: '#261F19',
    raised: '#2E261F',
    text: '#F3ECE0',
    secondary: '#CDBFAE',
    muted: '#AE9F8C',
    divider: 'rgba(243, 236, 224, 0.12)',
    border: 'rgba(243, 236, 224, 0.5)',
  },
};

/**
 * The signboard: the top bar, the aisle signs. The same painted green in both
 * modes (a deeper coat after hours), cream lettering.
 */
export const SIGN = {
  light: { board: '#1E4636', edge: '#12301F', ink: '#FBF4E4', inkSoft: '#D9E6DC' },
  dark: { board: '#163327', edge: '#0C1F17', ink: '#F3ECE0', inkSoft: '#C9D8CD' },
};

/** Shelf wood: the plank's top face, its front face, the shadow under it. */
export const WOOD = {
  light: { top: '#C08A55', front: '#8E5B30', edge: '#5E3A1C', grain: 'rgba(60, 30, 10, 0.18)' },
  dark: { top: '#6B4729', front: '#4F331D', edge: '#2A1A0D', grain: 'rgba(0, 0, 0, 0.30)' },
};

/** The price sticker: sticker yellow, dark ink. A fill, never an ink. */
export const STICKER = {
  unread: { ground: '#F4C542', ink: '#221B14', rim: 'rgba(120, 80, 0, 0.35)' },
  onReader: { ground: '#9ED9BD', ink: '#10231B', rim: 'rgba(10, 60, 40, 0.35)' },
};

/** A shelf talker: an index card, ink handwriting, a red rule across the top. */
export const TALKER = {
  card: '#FFFBEA',
  ink: '#1F2A44',
  rule: '#D0473E',
  line: 'rgba(31, 42, 68, 0.12)',
};

function buildBookOverrides(mode) {
  const isDark = mode === 'dark';
  const s = SURFACES[mode];
  const sign = SIGN[mode];

  return {
    palette: {
      background: {
        default: s.page,
        paper: s.surface,
        card: s.card,
        raised: s.raised,
      },
      text: {
        primary: s.text,
        secondary: s.secondary,
        muted: s.muted,
      },
      divider: s.divider,
      // A control's outline — an unchecked facet box, a pill, a chip
      // (@geeksuite/collection draws them in `palette.border`). A control
      // must read as one (≈3:1 on the page in both modes).
      border: s.border,
      sign,
      wood: WOOD[mode],
      sticker: STICKER,
      talker: TALKER,
      // Identity tones, not semantics. `progress` is the one amber in the app
      // (the bookmark ribbon on covers and the detail slider); `shelf` colors the
      // shelf state of a book everywhere it appears.
      progress: {
        main: isDark ? '#F2A73B' : '#A34E0B',
        // The bookmark ribbon (components/BookCover): silk, not a warning light.
        ribbon: isDark ? '#D9821F' : '#A34E0B',
        contrastText: '#1B1206',
      },
      shelf: isDark
        ? {
            reading: '#F2A73B',
            'on-reader': '#7FD3B0',
            unread: '#CDBFAE',
            read: '#86C9A6',
            'want-to-read': '#C9A8F0',
            abandoned: '#F59A9A',
            'need-to-find': '#F4A56A',
            custom: '#CDBFAE',
          }
        : {
            reading: '#A34E0B',
            'on-reader': '#0F6B52',
            unread: '#54483B',
            read: '#1E5B43',
            'want-to-read': '#6A3FA0',
            abandoned: '#B02A2A',
            'need-to-find': '#A2440F',
            custom: '#54483B',
          },
    },

    typography: {
      fontFamily: BODY_FONT,
      // DM Serif Display ships weight 400 only — never bold it (a faked bold smears).
      h1: { fontFamily: SERIF_FONT, fontSize: '2.5rem', fontWeight: 400 },
      h2: { fontFamily: SERIF_FONT, fontSize: '2rem', fontWeight: 400 },
      h3: { fontFamily: SERIF_FONT, fontSize: '1.5rem', fontWeight: 400 },
      h4: { fontWeight: 600 },
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
      button: { fontWeight: 600, textTransform: 'none' },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: s.page,
            // After hours: one lamp over the shop floor. By day, nothing.
            ...(isDark
              ? { backgroundImage: 'radial-gradient(90% 50% at 50% 0%, rgba(242, 167, 59, 0.07), transparent 70%)', backgroundAttachment: 'fixed' }
              : null),
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            backgroundColor: s.card,
            border: `1px solid ${s.divider}`,
            boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.4)' : '0 2px 8px rgba(60, 40, 15, 0.08)',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 6 },
          containedPrimary: { boxShadow: 'none' },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: { root: { backgroundColor: s.surface } },
      },
    },
  };
}

/**
 * createBookTheme(mode)
 *
 * Composes shared GeekSuite rules with BookGeek's "Used Bookstore" identity.
 */
export function createBookTheme(mode = 'dark') {
  const accent = accentFor(mode);

  const theme = createGeekSuiteTheme({
    mode,
    accent,
    overrides: buildBookOverrides(mode),
  });

  // Failsafe: Ensure theme.palette.glow is always defined even if
  // Vite is serving an outdated, pre-bundled cache of @geeksuite/ui.
  if (!theme.palette.glow) {
    theme.palette.glow = {
      ring: alpha(accent.main, 0.2),
      soft: alpha(accent.main, 0.06),
      medium: alpha(accent.main, 0.1),
      border: alpha(accent.main, 0.3),
    };
  }

  return theme;
}

export default createBookTheme;
