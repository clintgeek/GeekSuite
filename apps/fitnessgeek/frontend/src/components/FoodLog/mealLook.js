import {
  Coffee as BreakfastIcon,
  Restaurant as LunchIcon,
  DinnerDining as DinnerIcon,
  Cookie as SnackIcon
} from '@mui/icons-material';

// Each meal's icon and colours. The colours are the retired Studio Slate
// gradients; wave C replaces them with Market Morning's produce colours, and
// `mealLook()` below is the ONE place this component reads a meal colour
// from, so that is a change to one function. The titles come from
// plainWords' mealLabel(), the same words as Home; the emoji are gone
// (UX review IA-6).
const MEAL_CONFIG = {
  breakfast: {
    icon: BreakfastIcon,
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    lightBg: 'rgba(245, 158, 11, 0.08)',
    darkBg: 'rgba(245, 158, 11, 0.15)'
  },
  lunch: {
    icon: LunchIcon,
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    lightBg: 'rgba(16, 185, 129, 0.08)',
    darkBg: 'rgba(16, 185, 129, 0.15)'
  },
  dinner: {
    icon: DinnerIcon,
    gradient: 'linear-gradient(135deg, #0D9488, #0F766E)',
    lightBg: 'rgba(13, 148, 136, 0.08)',
    darkBg: 'rgba(13, 148, 136, 0.15)'
  },
  snack: {
    icon: SnackIcon,
    gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    lightBg: 'rgba(139, 92, 246, 0.08)',
    darkBg: 'rgba(139, 92, 246, 0.15)'
  }
};

/**
 * A meal's colours for this theme: `badge` (the icon disc and the Add
 * button's fill), `badgeInk` (what sits on it) and `headerBg` (the header's
 * tint). Wave C: swap the body for `theme.palette.produce[mealType]`.
 */
export function mealLook(mealType, theme) {
  const config = MEAL_CONFIG[mealType] || MEAL_CONFIG.snack;
  return {
    badge: config.gradient,
    badgeInk: '#ffffff',
    headerBg: theme.palette.mode === 'dark' ? config.darkBg : config.lightBg,
  };
}

/** The meal's icon component. */
export const mealIcon = (mealType) => (MEAL_CONFIG[mealType] || MEAL_CONFIG.snack).icon;
