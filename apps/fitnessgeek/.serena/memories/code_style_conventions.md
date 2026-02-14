# FitnessGeek Code Style & Conventions

## General Principles
- Follow the GeekSuite Unified Design System for all UI/UX decisions
- Write clean, maintainable, and well-documented code
- Use consistent naming conventions across frontend and backend
- Prefer functional components and modern JavaScript/React patterns

## JavaScript/React Style

### Naming Conventions
- **Components**: PascalCase (e.g., `FoodSearch`, `AIInsightsCard`)
- **Files**: camelCase for JS/JSX (e.g., `foodService.js`, `Reports.jsx`)
- **Variables/Functions**: camelCase (e.g., `fetchReports`, `userId`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `API_BASE_URL`, `MAX_RETRIES`)
- **CSS Classes**: kebab-case (when not using CSS-in-JS)

### React Patterns
- Use functional components with hooks
- Prefer arrow functions for component definitions
- Use `useState`, `useEffect`, `useCallback`, `useMemo` appropriately
- Extract reusable logic into custom hooks
- Keep components focused and single-responsibility

### File Organization
- One component per file
- Co-locate related files (component, styles, tests)
- Use index files for clean imports
- Organize by feature/domain rather than type

### Import Order
1. React and third-party libraries
2. MUI components
3. Local components
4. Services and utilities
5. Assets and styles

Example:
```javascript
import React, { useState, useEffect } from 'react';
import { Box, Card, Typography } from '@mui/material';
import AIInsightsCard from '../components/Dashboard/AIInsightsCard.jsx';
import { reportsService } from '../services/reportsService.js';
import { formatDate } from '../utils/dateUtils.js';
```

## Backend Style

### API Design
- RESTful endpoints following standard conventions
- Use proper HTTP methods (GET, POST, PUT, DELETE)
- Consistent response format: `{ success, data, message, error }`
- Proper error handling with meaningful messages

### Route Structure
```javascript
router.get('/api/resource', middleware, controller.method);
router.post('/api/resource', auth, validation, controller.method);
```

### Service Layer
- Business logic in service files
- Controllers handle HTTP concerns only
- Services return data or throw errors
- Use async/await consistently

### Error Handling
```javascript
try {
  const result = await service.doSomething();
  res.json({ success: true, data: result });
} catch (error) {
  logger.error('Error message', { error, userId });
  res.status(500).json({ 
    success: false, 
    message: 'User-friendly error message',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}
```

## Database

### Model Naming
- Singular PascalCase for model names (e.g., `User`, `FoodLog`, `Weight`)
- Use descriptive field names in camelCase
- Include timestamps: `{ timestamps: true }`

### Queries
- Use lean() for read-only queries
- Select only needed fields
- Use proper indexes for performance
- Handle errors gracefully

## Design System Adherence

### Colors
Use the GeekSuite color palette:
- Primary: `#4A90E2` (Geek Blue)
- Secondary: `#7B61FF` (Accent Purple)
- Success: `#28A745`
- Warning: `#FFC107`
- Error: `#DC3545`

### Spacing
- Base unit: 8px
- Common spacings: 8px, 16px, 24px, 32px
- Use MUI's spacing system: `sx={{ p: 2, m: 3 }}`

### Typography
- Use Roboto font family
- Consistent heading hierarchy (h1-h6)
- Body text: 1.125rem (large), 0.875rem (small)

### Components
- Rounded corners: 16px (`borderRadius: 2` in MUI)
- Cards with soft shadows
- Consistent button sizing and styling
- Use MUI components for consistency

## Comments & Documentation
- Use JSDoc for functions and complex logic
- Add inline comments for non-obvious code
- Document API endpoints with route comments
- Keep README files up to date

## Testing
- Write tests for critical business logic
- Test API endpoints with proper scenarios
- Mock external services appropriately
- Use descriptive test names

## Version Control (Chef Only)
- Meaningful commit messages
- Feature branches for new work
- Regular commits with logical groupings
- Never commit sensitive data (.env files)