/**
 * The in-app reader's own page pair (review 2026-11-18 #3). It stays outside
 * the app theme's mode on purpose — a reader in the app's dark mode can still
 * read on warm paper — but it is the bookstore's paper and ink now, not
 * Tailwind slate:
 *
 *   light  the warm paper page it always had, the store's brown-black ink,
 *          bookstore-green links;
 *   dark   "after hours": the shop floor's warm near-black, cream ink, the
 *          after-hours green for links.
 *
 * The bars around the page are the signboard (theme SIGN): green board, cream
 * serif lettering. Contrast is measured in
 * __tests__/theme/usedBookstoreContrast.test.js.
 */
import { SIGN, SURFACES } from "../theme/theme";

export const READER_PALETTES = {
  light: {
    page: "#F6F1E7",
    ink: SURFACES.light.text,
    link: "#1E5B43",
    sign: SIGN.light,
  },
  dark: {
    page: SURFACES.dark.page,
    ink: SURFACES.dark.text,
    link: "#86C9A6",
    sign: SIGN.dark,
  },
};

export const readerPalette = (mode) => READER_PALETTES[mode] || READER_PALETTES.dark;
