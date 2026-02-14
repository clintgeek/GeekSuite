# 🏃‍♂️ FitnessGeek - Nutrition & Fitness Tracking App

A modern, full-stack nutrition and fitness tracking application built with React, Material-UI, and Node.js. Track your food intake, weight, and nutrition goals with a beautiful, intuitive interface.

## ✨ Features

### 🔐 Authentication System
- **User Registration & Login** - Secure authentication with JWT tokens
- **Protected Routes** - Automatic redirection for unauthenticated users
- **Profile Management** - User settings and account information
- **Session Persistence** - Stay logged in across browser sessions

### 🍎 Food Tracking
- **Smart Food Search** - Search from multiple nutrition databases (USDA, Nutritionix, OpenFoodFacts)
- **Real-time API Integration** - Live food data from nutrition-tracker backend
- **Food Logging** - Log meals with serving sizes and meal types
- **Recent Foods** - Quick access to frequently used foods
- **Custom Foods** - Create and save your own food items

### 📊 Weight Management
- **Weight Logging** - Track your weight over time
- **Weight Goals** - Set target weight and timeline
- **Progress Visualization** - View weight trends and statistics
- **Goal Tracking** - Monitor progress toward weight goals

### 🎯 Nutrition Goals
- **Daily Calorie Targets** - Set personalized calorie goals
- **Macronutrient Goals** - Protein, carbs, and fat targets
- **Progress Tracking** - Real-time progress bars and statistics
- **Goal Management** - Create, edit, and update nutrition goals

### 📈 Dashboard & Analytics
- **Daily Summary** - Overview of today's nutrition intake
- **Progress Charts** - Visual representation of your data
- **Quick Actions** - Fast access to common tasks
- **Statistics** - Detailed nutrition and weight analytics

### 🎨 Modern UI/UX
- **GeekSuite Design System** - Consistent, professional design
- **Responsive Layout** - Works on desktop, tablet, and mobile
- **Material-UI Components** - Beautiful, accessible interface
- **Dark Mode Support** - Toggle between light and dark themes

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Backend API running (nutrition-tracker)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd fitnessGeek
   ```

2. **Install dependencies**
   ```bash
   cd frontend
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:5174`

### Backend Setup
Make sure the nutrition-tracker backend is running on port 4081:
```bash
cd ../nutrition-tracker/backend
npm install
npm start
```

## 🏗️ Architecture

### Frontend Structure
```
frontend/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── FoodSearch/     # Food search functionality
│   │   ├── FoodLog/        # Food logging components
│   │   ├── Layout/         # Main layout and navigation
│   │   └── ProtectedRoute/ # Authentication wrapper
│   ├── pages/              # Main application pages
│   │   ├── Dashboard.jsx   # Main dashboard
│   │   ├── Login.jsx       # Authentication
│   │   ├── FoodLog.jsx     # Food tracking
│   │   ├── Weight.jsx      # Weight management
│   │   ├── Goals.jsx       # Nutrition goals
│   │   └── Profile.jsx     # User settings
│   ├── services/           # API service layer
│   │   ├── apiService.js   # Base API configuration
│   │   ├── authService.js  # Authentication API
│   │   ├── foodService.js  # Food search API
│   │   ├── foodLogService.js # Food logging API
│   │   ├── weightService.js # Weight tracking API
│   │   └── goalsService.js # Nutrition goals API
│   ├── contexts/           # React contexts
│   │   └── AuthContext.jsx # Authentication state
│   ├── hooks/              # Custom React hooks
│   │   └── useAuth.js      # Authentication hook
│   └── theme/              # Material-UI theme
│       └── theme.js        # GeekSuite design system
```

### API Integration
The frontend connects to the nutrition-tracker backend API:

- **Authentication**: `/api/auth/*`
- **Food Search**: `/api/foods/*`
- **Food Logging**: `/api/logs/*`
- **Weight Tracking**: `/api/weight/*`
- **Nutrition Goals**: `/api/goals/*`

## 🎨 Design System

### GeekSuite Design Language
- **Primary Color**: `#6098CC` (Professional blue)
- **Typography**: Clean, readable fonts with proper hierarchy
- **Spacing**: Consistent 8px grid system
- **Components**: Material-UI with custom styling
- **Icons**: Material Design icons throughout

### Key Design Principles
- **Simplicity** - Clean, uncluttered interfaces
- **Accessibility** - WCAG compliant components
- **Responsiveness** - Mobile-first design approach
- **Consistency** - Unified design language across all pages

## 🔧 Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

### Environment Variables
Create a `.env` file in the frontend directory:
```env
VITE_API_URL=http://localhost:4081/api
```

### Code Style
- **ESLint** - JavaScript/React linting
- **Prettier** - Code formatting
- **TypeScript** - Type safety (optional)

## 📱 Features in Detail

### Food Search
- **Multi-source search** from USDA, Nutritionix, and OpenFoodFacts
- **Real-time results** with nutritional information
- **Recent foods** for quick access
- **Custom food creation** for personal items
- **Barcode scanning** support (coming soon)

### Food Logging
- **Meal categorization** (breakfast, lunch, dinner, snack)
- **Serving size tracking** with customizable units
- **Daily summaries** with macro breakdowns
- **Edit and delete** logged foods
- **Date-based filtering**

### Weight Tracking
- **Daily weight logging** with date tracking
- **Weight goal setting** with target dates
- **Progress visualization** with trend analysis
- **Statistics calculation** (average, change, etc.)
- **PDF report generation** (coming soon)

### Nutrition Goals
- **Daily calorie targets** with macro breakdowns
- **Progress tracking** with visual indicators
- **Goal management** (create, edit, delete)
- **Real-time progress** against daily targets
- **Historical goal tracking**

## 🔒 Security

### Authentication
- **JWT tokens** for secure authentication
- **Token refresh** for extended sessions
- **Protected routes** with automatic redirection
- **Secure API calls** with authentication headers

### Data Protection
- **HTTPS** for all API communications
- **Input validation** on all forms
- **Error handling** without exposing sensitive data
- **Session management** with secure storage

## 🚀 Deployment

### Production Build
```bash
npm run build
```

### Docker Support
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Configuration
- **Development**: `http://localhost:4081/api`
- **Production**: Configure via environment variables
- **Staging**: Separate API endpoints for testing

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Code Standards
- Follow ESLint configuration
- Use meaningful commit messages
- Add JSDoc comments for functions
- Test your changes thoroughly

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Material-UI** for the component library
- **nutrition-tracker** backend for the API
- **USDA Food Database** for nutrition data
- **Nutritionix** for additional food information
- **OpenFoodFacts** for barcode data

## 📞 Support

For questions, issues, or feature requests:
- Create an issue on GitHub
- Check the documentation
- Review the troubleshooting guide

---

**Built with ❤️ by the FitnessGeek team**
