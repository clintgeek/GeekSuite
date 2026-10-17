import {
  Coffee as BreakfastIcon,
  Restaurant as LunchIcon,
  DinnerDining as DinnerIcon,
  Cookie as SnackIcon
} from '@mui/icons-material';
import { mealColors } from '../../theme/theme.jsx';

// Each meal's icon. The colours are Market Morning's produce (visual review
// A1): the same meal is the same colour here as on Home's meal cards —
// tomato Breakfast, leaf Lunch, lemon Dinner, plum Snacks. The retired Studio
// Slate gradients put white on amber (2.15:1) and called Dinner teal. The
// titles come from plainWords' mealLabel(), the same words as Home.
const MEAL_ICONS = {
  breakfast: BreakfastIcon,
  lunch: LunchIcon,
  dinner: DinnerIcon,
  snack: SnackIcon
};

/**
 * A meal's colours for this theme: `badge` (the icon disc and the Add
 * button's fill), `badgeInk` (the ink that always sits on it), `headerBg`
 * (the header's tint) and `edge` (the produce edge along the top). Read from
 * `theme.palette.produce`, falling back to mealColors() for a bare MUI theme.
 */
export function mealLook(mealType, theme) {
  const mode = theme?.palette?.mode === 'dark' ? 'dark' : 'light';
  const produce = theme?.palette?.produce?.[mealType] || mealColors(mealType, mode);
  return {
    badge: produce.fill,
    badgeInk: produce.ink,
    headerBg: produce.tint,
    edge: produce.fill,
  };
}

/** The meal's icon component. */
export const mealIcon = (mealType) => MEAL_ICONS[mealType] || MEAL_ICONS.snack;
