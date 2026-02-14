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

export const getSourceColor = (source) => {
  switch (source?.toLowerCase()) {
    case 'usda':
      return '#4CAF50'; // Green
    case 'nutritionix':
      return '#2196F3'; // Blue
    case 'openfoodfacts':
      return '#FF9800'; // Orange
    case 'custom':
      return '#9C27B0'; // Purple
    default:
      return '#757575'; // Grey
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
      return 'My Foods';
    default:
      return source || 'Unknown';
  }
};
