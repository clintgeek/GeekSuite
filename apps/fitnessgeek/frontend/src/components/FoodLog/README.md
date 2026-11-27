# FoodLog components

What the Today page (`src/pages/Today.jsx`) uses to add to, and change, a
day's food. The Food log page itself is gone: Home and Food log are one page
now (`DOCS/ONE_APP_PLAN.md` §1), and `/food-log` redirects to `/dashboard`
with its query string.

| File | What it is |
|---|---|
| `AddFoodDialog.jsx` | The add sheet: the `FoodComposer` in a dialog, on the meal that was tapped, plus the barcode scanner. |
| `FoodLogItem.jsx` | One logged food as a row: name, amount, calories. The whole row opens Edit. |
| `EditLogDialog.jsx` | Edit one entry: servings, meal, day, calories and nutrition, and Remove. |
| `SaveMealDialog.jsx` | Save a meal's entries as a meal (from the meal's "more" menu). |
| `CopyMealDialog.jsx` | Copy a meal or a whole day from another day, or from someone in the household. |
| `HouseholdLogView.jsx` | What the household ate on the day on screen. |
| `NutritionInputs.jsx` | The calorie and macro fields `EditLogDialog` uses. |
| `amount.js` | An entry's amount in a few characters ("×2", "6 oz"), and what it comes to in calories. |
| `dayWords.js`, `copyWords.js` | Days and copies in words. |
| `mealLook.js` | A meal's colours and icon for the current theme. |

The meals themselves (one card, a row per meal) are drawn by
`src/components/Home/MealCards.jsx`, and the day's reads live in
`src/components/Home/useDayData.js`.
