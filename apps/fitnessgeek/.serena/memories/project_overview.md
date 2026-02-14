# FitnessGeek Project Overview

## Purpose
FitnessGeek is a modern, full-stack nutrition and fitness tracking application that helps users track their food intake, weight, blood pressure, medications, and achieve their nutrition goals. It's part of the GeekSuite collection of applications.

## Tech Stack

### Frontend
- **Framework**: React 19.1.0 with Vite 7.0.4
- **UI Library**: Material-UI (MUI) v7.2.0
- **State Management**: Zustand 5.0.6
- **Routing**: React Router DOM v7.7.0
- **Charts**: Recharts 3.1.0, Nivo (line, pie)
- **Styling**: Emotion (CSS-in-JS), Framer Motion for animations
- **Additional**: date-fns, axios, html2canvas, jspdf

### Backend
- **Runtime**: Node.js 18+ (LTS required)
- **Framework**: Express.js 4.18.2
- **Database**: MongoDB 8.0.3 with Mongoose ODM
- **Authentication**: JWT (jsonwebtoken 9.0.2) + bcryptjs 2.4.3
- **Logging**: Winston 3.11.0
- **Cache**: Redis 4.6.10
- **HTTP Client**: Axios 1.6.2
- **Date Handling**: date-fns 4.1.0
- **Integration**: Garmin Connect API

### Deployment
- **Containerization**: Docker + Docker Compose
- **Web Server**: Nginx (for frontend static files)
- **Environment**: Development on macOS, Production on Linux server

## Architecture
- Monorepo structure with separate `frontend/` and `backend/` directories
- RESTful API architecture
- JWT-based authentication
- MongoDB for data persistence
- PWA (Progressive Web App) support
- Responsive design following GeekSuite Design System

## Key Features
1. **Authentication**: Secure user registration/login with JWT
2. **Food Tracking**: Smart search across multiple nutrition databases (USDA, Nutritionix, OpenFoodFacts)
3. **Weight Management**: Track weight, set goals, view trends
4. **Blood Pressure**: Monitor BP readings over time
5. **Medications**: Track medication intake
6. **Nutrition Goals**: Set and track daily calorie/macro targets
7. **AI Insights**: Weekly reports, trend watching, coaching via baseGeek AI
8. **Reports**: Comprehensive nutrition reports with CSV export
9. **Dashboard**: Real-time progress tracking and analytics

## Integration
- Part of GeekSuite ecosystem
- Uses baseGeek for centralized AI services
- Shared design system across all Geek apps