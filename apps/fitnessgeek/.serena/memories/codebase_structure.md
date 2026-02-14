# FitnessGeek Codebase Structure

## Root Level
```
/Users/ccrocker/projects/fitnessGeek/
├── backend/              # Node.js/Express API
├── frontend/             # React/Vite app
├── DOCS/                 # Documentation
├── docker-compose.yml    # Container orchestration
├── deploy.sh            # Deployment script
└── README.md            # Project documentation
```

## Backend Structure (`backend/`)
```
backend/
├── src/
│   ├── server.js              # Main entry point
│   ├── config/
│   │   ├── database.js/ts     # MongoDB configuration
│   │   └── logger.js/ts       # Winston logger setup
│   ├── middleware/
│   │   └── auth.js            # JWT authentication
│   ├── models/                # Mongoose schemas
│   │   ├── BloodPressure.js
│   │   ├── DailySummary.js
│   │   ├── FoodItem.js
│   │   ├── FoodLog.js
│   │   ├── LoginStreak.js
│   │   ├── Meal.js
│   │   ├── Medication.js
│   │   ├── MedicationLog.js
│   │   ├── NutritionGoals.js
│   │   ├── UserSettings.js
│   │   ├── Weight.js
│   │   └── WeightGoals.js
│   ├── controllers/           # Route handlers
│   │   ├── bloodPressureController.js
│   │   ├── foodReportController.js
│   │   └── weightController.js
│   ├── routes/                # API endpoints
│   │   ├── aiRoutes.js
│   │   ├── authRoutes.js
│   │   ├── bloodPressureRoutes.js
│   │   ├── fitnessRoutes.js
│   │   ├── foodReportRoutes.js    # Reports API
│   │   ├── foodRoutes.js
│   │   ├── goalRoutes.js
│   │   ├── insightsRoutes.js      # AI Insights API
│   │   ├── logRoutes.js
│   │   ├── mealRoutes.js
│   │   ├── medicationRoutes.js
│   │   ├── recipeRoutes.js
│   │   ├── settingsRoutes.js
│   │   ├── streakRoutes.js
│   │   ├── summaryRoutes.js
│   │   ├── userRoutes.js
│   │   └── weightRoutes.js
│   ├── services/              # Business logic
│   │   ├── aiInsightsService.js       # AI insights generation
│   │   ├── baseGeekAIService.js       # BaseGeek AI integration
│   │   ├── fitnessGoalService.js
│   │   ├── foodApiService.js          # External food APIs
│   │   ├── foodQualityService.js
│   │   ├── foodReportService.js       # Reports & analytics
│   │   ├── foodServingMap.js
│   │   ├── garminConnectService.js
│   │   ├── indicationMap.js
│   │   ├── matchService.js
│   │   ├── openFoodFactsService.js
│   │   ├── rxService.js
│   │   ├── unitConversion.js
│   │   └── unifiedFoodService.js
│   ├── types/                 # TypeScript definitions
│   └── utils/                 # Utility functions
├── scripts/                   # Maintenance scripts
│   ├── importBloodPressureSimple.js
│   ├── importWeight.js
│   └── migrateUserIds.js
├── logs/                      # Application logs
├── package.json
├── tsconfig.json
├── Dockerfile
└── nodemon.json
```

## Frontend Structure (`frontend/`)
```
frontend/
├── src/
│   ├── main.jsx              # Entry point
│   ├── App.jsx               # Root component
│   ├── index.css             # Global styles
│   ├── components/           # Reusable components
│   │   └── Dashboard/
│   │       └── AIInsightsCard.jsx   # AI insights widget
│   ├── pages/                # Route pages
│   │   ├── AITest.jsx
│   │   ├── Activity.jsx
│   │   ├── BarcodeTest.jsx
│   │   ├── BloodPressure.jsx
│   │   ├── DashboardNew.jsx
│   │   ├── Food.jsx
│   │   ├── FoodLog.jsx
│   │   ├── FoodSearch.jsx
│   │   ├── Goals.jsx
│   │   ├── Login.jsx
│   │   ├── Medications.jsx
│   │   ├── MyFoods.jsx
│   │   ├── MyMeals.jsx
│   │   ├── Profile.jsx
│   │   ├── Recipes.jsx
│   │   ├── Register.jsx
│   │   ├── Reports.jsx          # Reports & AI insights page
│   │   ├── Settings.jsx
│   │   └── Weight.jsx
│   ├── services/             # API service layer
│   │   ├── aiService.js
│   │   ├── apiService.js       # Base API client
│   │   ├── authService.js
│   │   ├── bpService.js
│   │   ├── fitnessGeekService.js
│   │   ├── foodService.js
│   │   ├── goalsService.js
│   │   ├── insightsService.js  # AI insights API client
│   │   ├── matcherService.js
│   │   ├── medsService.js
│   │   ├── reportsService.js   # Reports API client
│   │   ├── settingsService.js
│   │   ├── streakService.js
│   │   ├── userService.js
│   │   └── weightService.js
│   ├── contexts/             # React contexts
│   ├── hooks/                # Custom React hooks
│   ├── theme/                # MUI theme configuration
│   ├── utils/                # Utility functions
│   └── assets/               # Static assets
├── public/
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # Service worker
│   └── icons/                # App icons
├── package.json
├── vite.config.js
├── eslint.config.js
├── Dockerfile
└── nginx.conf
```

## Documentation (`DOCS/`)
Key documentation files:
- `CURSOR-CONTEXT.md` - Critical build/deployment rules
- `GeekSuite_Unified_Design_System.md` - Design system
- `AI_INTEGRATION_PLANS.md` - AI feature planning
- `PHASE_1_COMPLETE.md` - Completed features
- Various feature-specific docs

## Key Architectural Patterns

### Backend
1. **Layered Architecture**: Routes → Controllers → Services → Models
2. **Service Layer**: Business logic isolated in service files
3. **Middleware**: Authentication, validation, error handling
4. **Models**: Mongoose schemas with timestamps
5. **Logging**: Winston for structured logging

### Frontend
1. **Component-Based**: Reusable React components
2. **Service Layer**: Axios-based API clients
3. **State Management**: Zustand stores + React hooks
4. **Routing**: React Router with protected routes
5. **Theme**: MUI theme system with GeekSuite design

### API Structure
- RESTful endpoints: `/api/{resource}/{action}`
- Standard response: `{ success, data, message, error }`
- JWT authentication via middleware
- Consistent error handling

## Recent AI Reports Implementation
**Backend:**
- `foodReportService.js` - Generates macro totals, trends, goal compliance
- `aiInsightsService.js` - Weekly reports, trend watching via baseGeek AI
- `foodReportRoutes.js` - `/api/food-reports/overview`, `/trends`, `/export`
- `insightsRoutes.js` - `/api/insights/weekly-report`, `/trend-watch`

**Frontend:**
- `Reports.jsx` - Main reports page with filters, CSV export
- `reportsService.js` - Reports API client
- `insightsService.js` - AI insights API client
- `AIInsightsCard.jsx` - Dashboard widget for AI insights
- Shared markdown parser for formatting AI content