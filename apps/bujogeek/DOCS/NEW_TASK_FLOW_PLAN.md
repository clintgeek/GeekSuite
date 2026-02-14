# New Task Flow Plan

## Overview
This document outlines the plan for implementing a unified task management system that follows the sorting rules defined in SORTING_RULES.md. The system will handle task management across ALL, DAILY, WEEKLY, and MONTHLY views, with a focus on DRY code and clear separation of concerns.

## UI/UX Considerations

### View Hierarchy
- **ALL View**: Serves as the base UI/UX pattern for:
  - ALL view
  - DAILY view
  - WEEKLY view
- **MONTHLY View**: Maintains its current UI/UX pattern, requiring only task flow improvements

## Architecture

### 1. Backend Architecture

#### Task Service Layer
- `TaskService` class handling all task operations:
  - Fetching tasks for given time ranges
  - Creating/updating tasks
  - Applying sorting rules
  - Handling task migrations (floating)

#### Database Layer
- Task schema fields:
  - `id`
  - `title`
  - `scheduledDate`
  - `creationDate`
  - `completionDate`
  - `priority`
  - `status` (complete/incomplete)

#### API Endpoints
- `/api/tasks` - Base endpoint for task operations:
  - GET with query params for date range
  - POST for creating tasks
  - PUT for updating tasks
- Consider GraphQL implementation for flexible querying

### 2. Frontend Architecture

#### Task Management Store
- Central store (Redux/Zustand) for task state management
- Actions for:
  - Fetching tasks
  - Creating/updating tasks
  - Applying sorting rules
  - Handling task migrations

#### Task Utilities
- `taskUtils` module with pure functions for:
  - Sorting tasks according to rules
  - Determining task visibility
  - Handling task migrations
  - Priority management

#### View Components
- Base `TaskView` component:
  - Handles task fetching
  - Applies sorting rules
  - Manages task display
- Extended components for:
  - Daily view
  - Weekly view
  - Monthly view (with current UI/UX)

## Implementation Strategy

### Phase 1: Core Infrastructure
- Implement backend task service
- Create database schema
- Set up API endpoints
- Implement basic frontend store

### Phase 2: Task Management Logic
- Implement sorting rules
- Create task utilities
- Set up task migration logic
- Implement priority management

### Phase 3: View Implementation
- Create base TaskView component
- Implement ALL view as base pattern
- Extend to DAILY view
- Extend to WEEKLY view
- Update MONTHLY view with new task flow

### Phase 4: Testing and Refinement
- Unit tests for sorting rules
- Integration tests for task flow
- Performance testing
- Edge case handling

## Key Considerations

### DRY Principles
- Centralize sorting logic
- Reuse task fetching and management code
- Share utility functions across views

### Separation of Concerns
- Backend: data persistence and business logic
- Frontend: UI and user interactions
- Shared types and interfaces

### Performance
- Efficient database queries
- Caching strategies
- Optimized task sorting and filtering

### Maintainability
- Clear documentation
- Type safety
- Consistent error handling
- Logging for debugging

## Next Steps
1. Review and approve this plan
2. Begin implementation of Phase 1
3. Regular reviews of progress and adjustments as needed
4. Consider YEAR view implementation in future updates