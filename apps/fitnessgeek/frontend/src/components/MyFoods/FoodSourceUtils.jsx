import {
  Restaurant as FoodIcon,
  LocalDining as CustomFoodIcon,
  Public as UsdaIcon,
  Store as NutritionixIcon,
  Category as OpenFoodFactsIcon
} from '@mui/icons-material';

export const getSourceIcon = (source) => {
  switch (source?.toLowerCase()) {
    case 'usda':
      return <UsdaIcon />;
    case 'nutritionix':
      return <NutritionixIcon />;
    case 'openfoodfacts':
      return <OpenFoodFactsIcon />;
    case 'custom':
      return <CustomFoodIcon />;
    default:
      return <FoodIcon />;
  }
};

/**
 * The source's dot colour, from the theme's semantic set (visual review B3) —
 * not MUI's green/blue/orange/purple. A dot only, never ink.
 */
export const getSourceColor = (source, theme) => {
  const p = theme?.palette || {};
  switch (source?.toLowerCase()) {
    case 'usda':
      return p.success?.main || '#2F7D32';
    case 'nutritionix':
      return p.info?.main || '#2A5F8F';
    case 'openfoodfacts':
      return p.warning?.main || '#9A5B00';
    case 'custom':
      return p.primary?.main || '#2F6B35';
    default:
      return p.text?.muted || p.text?.secondary || '#6B5847';
  }
};

export const getSourceName = (source) => {
  switch (source?.toLowerCase()) {
    case 'usda':
      return 'USDA';
    case 'nutritionix':
      return 'Nutritionix';
    case 'openfoodfacts':
      return 'Open Food Facts';
    case 'custom':
      return 'My foods';
    case undefined:
    case null:
    case '':
    case 'unknown':
      // An unknown source says nothing (UX review §2.7): "Unknown" was
      // printed in bold on four rows of five.
      return null;
    default:
      return source;
  }
};
