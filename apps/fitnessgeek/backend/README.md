# FitnessGeek Backend API

A comprehensive nutrition and fitness tracking API that integrates with the baseGeek ecosystem for authentication and user management.

## 🏗️ Architecture

- **Authentication**: Uses baseGeek's JWT tokens
- **Database**: Shared MongoDB instance (baseGeek's MongoDB)
- **API**: RESTful API with comprehensive nutrition tracking
- **Logging**: Winston logger with file and console output

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB (shared with baseGeek)
- baseGeek running for authentication

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment setup**:
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3001`

## 📊 Database Models

### FoodItem
- Global and user-specific food items
- Smart deduplication by barcode, source, or name
- Comprehensive nutrition data
- Support for multiple data sources

### FoodLog
- Individual food entries with meal types
- Calculated nutrition values
- Date-based organization

### DailySummary
- Pre-computed daily nutrition totals
- Meal breakdown (breakfast, lunch, dinner, snack)
- Goal tracking integration

### NutritionGoals
- User nutrition targets
- Progress tracking
- Historical goal management

## 🔌 API Endpoints

### Food Items
- `GET /api/foods` - Search and retrieve foods
- `GET /api/foods/:id` - Get single food item
- `POST /api/foods` - Create custom food
- `PUT /api/foods/:id` - Update food item
- `DELETE /api/foods/:id` - Soft delete food item

### Food Logs
- `GET /api/logs` - Get food logs for date
- `GET /api/logs/:id` - Get single food log
- `POST /api/logs` - Add food to log
- `PUT /api/logs/:id` - Update food log
- `DELETE /api/logs/:id` - Delete food log

### Daily Summaries
- `GET /api/summary/:date` - Get daily summary
- `GET /api/summary/today` - Get today's summary
- `GET /api/summary/week/:startDate` - Get weekly summary
- `POST /api/summary/:date/refresh` - Refresh daily summary

### Nutrition Goals
- `GET /api/goals` - Get active nutrition goals
- `POST /api/goals` - Create nutrition goals
- `PUT /api/goals` - Update nutrition goals
- `DELETE /api/goals` - Deactivate goals
- `GET /api/goals/progress/:date` - Get goals progress

## 🔐 Authentication

All endpoints require a valid JWT token from baseGeek in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

The token must contain:
- `id`: User ID
- `email`: User email
- `username`: Username

## 📝 Request/Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE"
  }
}
```

## 🗄️ Database Schema

### FoodItem
```javascript
{
  name: String (required),
  brand: String,
  barcode: String (unique),
  nutrition: {
    calories_per_serving: Number (required),
    protein_grams: Number,
    carbs_grams: Number,
    fat_grams: Number,
    fiber_grams: Number,
    sugar_grams: Number,
    sodium_mg: Number
  },
  serving: {
    size: Number (required),
    unit: String (default: 'g')
  },
  source: String (enum: ['nutritionix', 'usda', 'openfoodfacts', 'custom']),
  source_id: String,
  user_id: ObjectId (ref: 'User'),
  is_deleted: Boolean (default: false)
}
```

### FoodLog
```javascript
{
  user_id: ObjectId (ref: 'User', required),
  log_date: Date (required),
  meal_type: String (enum: ['breakfast', 'lunch', 'dinner', 'snack']),
  food_item_id: ObjectId (ref: 'FoodItem', required),
  servings: Number (required, min: 0.1),
  notes: String
}
```

### DailySummary
```javascript
{
  user_id: ObjectId (ref: 'User', required),
  date: Date (required),
  totals: {
    calories: Number,
    protein_grams: Number,
    carbs_grams: Number,
    fat_grams: Number,
    fiber_grams: Number,
    sugar_grams: Number,
    sodium_mg: Number
  },
  meals: {
    breakfast: { calories, protein_grams, carbs_grams, fat_grams },
    lunch: { calories, protein_grams, carbs_grams, fat_grams },
    dinner: { calories, protein_grams, carbs_grams, fat_grams },
    snack: { calories, protein_grams, carbs_grams, fat_grams }
  },
  goals_met: {
    calories: Boolean,
    protein: Boolean,
    carbs: Boolean,
    fat: Boolean
  }
}
```

### NutritionGoals
```javascript
{
  user_id: ObjectId (ref: 'User', required),
  calories: Number,
  protein_grams: Number,
  carbs_grams: Number,
  fat_grams: Number,
  fiber_grams: Number,
  sugar_grams: Number,
  sodium_mg: Number,
  start_date: Date (default: now),
  end_date: Date,
  is_active: Boolean (default: true)
}
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment | `development` |
| `MONGODB_URI` | MongoDB connection string | Required |
| `JWT_SECRET` | JWT secret (must match baseGeek) | Required |
| `LOG_LEVEL` | Logging level | `info` |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:3000,http://localhost:5173` |

### Development

```bash
# Start development server with hot reload
npm run dev

# Run tests
npm test

# Check logs
tail -f logs/combined.log
```

### Production

```bash
# Start production server
npm start

# Check application health
curl http://localhost:3001/health
```

## 🔍 Logging

Logs are written to:
- Console (development)
- `logs/combined.log` (all levels)
- `logs/error.log` (errors only)

Log format includes:
- Timestamp
- Log level
- Message
- Additional metadata (user ID, request path, etc.)

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --grep "food items"
```

## 📈 Performance

### Database Indexes
- Text search on food names and brands
- Compound indexes for common queries
- User-specific data isolation

### Caching Strategy
- Daily summaries are pre-computed
- Food items are cached in memory
- Recent logs are cached for quick access

## 🔒 Security

- JWT token validation on all endpoints
- User data isolation
- Input validation and sanitization
- Rate limiting (TODO)
- CORS configuration

## 🚀 Deployment

### Docker
```bash
# Build image
docker build -t fitnessgeek-backend .

# Run container
docker run -p 3001:3001 --env-file .env fitnessgeek-backend
```

### Manual Deployment
1. Set up environment variables
2. Install dependencies: `npm install --production`
3. Start server: `npm start`
4. Set up process manager (PM2, systemd, etc.)

## 🤝 Integration

### baseGeek Integration
- Shared MongoDB database
- JWT token validation
- User management delegation

### Frontend Integration
- RESTful API endpoints
- Consistent response format
- Error handling patterns

## 📚 API Documentation

For detailed API documentation, see the individual route files or run the server and visit:
- Health check: `GET /health`
- API endpoints: See route files in `src/routes/`

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
   - Check MongoDB is running
   - Verify connection string in `.env`
   - Check network connectivity

2. **JWT Token Invalid**
   - Ensure JWT_SECRET matches baseGeek
   - Check token format in Authorization header
   - Verify token hasn't expired

3. **CORS Errors**
   - Check CORS_ORIGINS configuration
   - Verify frontend origin is allowed

### Debug Mode

Set `LOG_LEVEL=debug` in `.env` for detailed logging.

## 📄 License

MIT License - see LICENSE file for details.