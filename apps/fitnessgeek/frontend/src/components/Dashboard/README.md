# Dashboard Components

A collection of reusable components for building consistent dashboard interfaces.

## Components

### MetricCard
Displays a metric with icon, value, subtitle, and optional progress bar.

```jsx
import { MetricCard } from '../components/Dashboard';

<MetricCard
  value="1,250"
  subtitle="calories today"
  icon={<ForkKnifeIcon />}
  color="success"
  progress={75}
  progressLabel="Goal: 2,000"
  progressValue={75}
  timeout={300}
/>
```

**Props:**
- `value` - The main metric value (string or JSX)
- `subtitle` - Subtitle text below the value
- `icon` - Icon component to display
- `color` - Theme color: 'success', 'info', 'error', 'warning', 'primary'
- `progress` - Progress bar value (0-100)
- `progressLabel` - Label for progress bar
- `progressValue` - Percentage value to display
- `timeout` - Animation timeout in ms
- `children` - Additional content to render below

### QuickActionCard
Interactive card for quick actions with hover effects.

```jsx
import { QuickActionCard } from '../components/Dashboard';

<QuickActionCard
  title="Log Food"
  icon={<FoodIcon />}
  color="success"
  onClick={() => handleAction('food')}
/>
```

**Props:**
- `title` - Action title
- `icon` - Icon component
- `color` - Theme color
- `onClick` - Click handler

### DashboardHeader
Gradient header with title and optional date display.

```jsx
import { DashboardHeader } from '../components/Dashboard';

<DashboardHeader
  title="Dashboard"
  showDate={true}
/>
```

**Props:**
- `title` - Header title (default: "Dashboard")
- `showDate` - Show current date (default: true)

### NutritionSummaryCard
Displays macronutrient breakdown in a grid layout.

```jsx
import { NutritionSummaryCard } from '../components/Dashboard';

<NutritionSummaryCard
  protein={120}
  carbs={200}
  fat={45}
  title="Today's Nutrition"
  timeout={700}
/>
```

**Props:**
- `protein` - Protein grams
- `carbs` - Carbohydrate grams
- `fat` - Fat grams
- `title` - Card title (default: "Today's Nutrition")
- `timeout` - Animation timeout

## Usage

Import components individually or use the index file:

```jsx
import {
  MetricCard,
  QuickActionCard,
  DashboardHeader,
  NutritionSummaryCard
} from '../components/Dashboard';
```

## Design Principles

- **Mobile-first**: All components are responsive
- **Consistent theming**: Uses MUI theme colors
- **Accessible**: Proper contrast and touch targets
- **Reusable**: DRY components with flexible props
- **Animated**: Subtle fade-in animations