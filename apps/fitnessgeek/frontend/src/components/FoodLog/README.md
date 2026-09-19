# FoodLog Component Library

A clean, reusable component library for food logging features that matches the Dashboard design system.

## Components

### `DateNavigator`
- **Purpose**: Date navigation with previous/next buttons
- **Props**: `selectedDate`, `onPreviousDay`, `onNextDay`, `formatDate`
- **Style**: Clean card with theme colors and consistent spacing

### `FoodLogLayout`
- **Purpose**: Main container with loading, alerts, and consistent styling
- **Props**: `loading`, `successMessage`, `errorMessage`, `onClearSuccess`, `onClearError`
- **Style**: Matches Dashboard layout with theme background and spacing

### `AddFoodDialog`
- **Purpose**: Reusable dialog for adding food to any meal type
- **Props**: `open`, `onClose`, `onFoodSelect`, `mealType`, `showBarcodeScanner`, `onShowBarcodeScanner`, `onBarcodeScanned`
- **Features**: Integrated FoodSearch and BarcodeScanner
- **Style**: Consistent with overall design system

### `NutritionSummary`
- **Purpose**: Macronutrient breakdown display
- **Props**: `summary`, `showGoals`
- **Style**: Grid layout with theme colors, no obvious headers

### `MealSection`
- **Purpose**: Individual meal type sections (breakfast, lunch, dinner, snack)
- **Props**: `mealType`, `logs`, `onAddFood`, `onEditLog`, `onDeleteLog`, `onSaveMeal`
- **Style**: Clean cards with theme colors, subtle headers

### `FoodLogItem`
- **Purpose**: Individual food item display
- **Props**: `log`, `onEdit`, `onDelete`, `showActions`, `compact`
- **Style**: Consistent with overall design system

## Custom Hooks

### `useFoodLog`
- **Purpose**: Manages all food log operations and state
- **Returns**: Logs, loading state, messages, nutrition summary, and operation functions
- **Features**: Automatic data loading, error handling, and state management

## Design Principles

- **No obvious headers** - Subtle, contextual information only
- **Theme consistency** - Uses MUI theme colors throughout
- **Mobile-first** - Responsive design with proper spacing
- **Reusable** - Components can be used across food-related pages
- **Clean styling** - Consistent borders, shadows, and spacing
- **Separation of concerns** - Business logic in hooks, UI in components

## Usage

```jsx
import {
  DateNavigator,
  AddFoodDialog,
  NutritionSummary,
  MealSection
} from '../components/FoodLog';
import { useFoodLog } from '../hooks/useFoodLog';
import { useFoodLogging } from '../hooks/useFoodLogging';

// Use in pages. `useFoodLog` owns the log list, goals and favourites;
// `useFoodLogging` owns logging-and-undo (logItems/undoLogs/describeMeal) —
// see FoodLog.jsx for how the two are composed together.
const {
  loading,
  nutritionSummary,
  getLogsByMealType,
  favoriteFoodIds,
  toggleFavoriteId
} = useFoodLog(selectedDate);

<DateNavigator {...dateProps} />
<NutritionSummary summary={nutritionSummary} />
<MealSection {...mealProps} favoriteFoodIds={favoriteFoodIds} onFavoriteChange={toggleFavoriteId} />
<AddFoodDialog {...dialogProps} />
```

Note: this doc previously described a `FoodLogLayout` wrapper and a
`FoodLogHeader` component; neither exists in the current tree (`FoodLogHeader`
was deleted as dead code — nothing imported it, see git history for details).

## Architecture Benefits

- **Cleaner pages** - Business logic extracted to hooks
- **Reusable components** - AddFoodDialog can be used anywhere
- **Better testing** - Components and hooks can be tested separately
- **Easier maintenance** - Changes in one place affect everywhere
- **Consistent patterns** - All food-related features follow same structure