# BuJoGeek - Digital Bullet Journal

## Overview
BuJoGeek is a minimalist digital Bullet Journal application that combines the simplicity of the Bullet Journal system with modern digital convenience. The app focuses on efficiency and user-friendliness while maintaining the core principles of bullet journaling.

## Core Features

### 1. Task Management
- **Signifiers System**:
  - `*` Task to do
  - `@` Scheduled Event/Appointment
  - `x` Completed Task
  - `<` Migrated Task
  - `>` Scheduled for Future Log
  - `-` Note/General Log
  - `!` Priority Task
  - `?` Question/Follow-up
  - `#` Tag

- **Task Types**:
  - Basic tasks
  - Recurring tasks (with customizable intervals)
  - Inline checklists (nested subtasks)
  - Priority tasks
  - Tagged tasks

### 2. Quick Entry
- Hotkey support (e.g., `Ctrl+Shift+T`)
- Auto-populated date/time
- Instant task creation

### 3. Views and Organization
- Daily task view
- Priority task view
- Filterable by:
  - Due dates
  - Priority
  - Tags
  - Status

### 4. Templates
- Custom page layouts
- Reusable templates
- Support for:
  - Daily logs
  - Meeting notes
  - Custom formats

### 5. Data Management
- Offline functionality
- Cloud synchronization
- Cross-device support
- Export options:
  - Markdown format
  - JSON format
  - ZIP backup

## Future Enhancements

### 1. Customization
- Theme customization
- Dark mode
- Font selection
- Color schemes

### 2. Advanced Features
- Markdown rendering
- Read-only sharing
- Progress tracking
- Habit tracking
- Statistics and analytics

## Technical Implementation

### Data Structure
- Text-based input
- Simple syntax
- Regex-based parsing
- Database storage with attributes:
  - Title
  - Due date
  - Priority
  - Tags
  - Recurring status
  - Status

### Export/Import
- Markdown format
- JSON format
- Backup/restore functionality

## Example Usage

### Daily Log Example
```
* Finish BuJoGeek documentation
@ Meeting with Sage at 3:00 PM
* Flock needs new food this week
! Renew SSL certs by end of day
? Check with IT about server downtime #work #meeting
```

### Weekly Reflection Template
```
Reflect on goals for the week
What went well?
What to improve?
```

## Development Roadmap

### Phase 1: Core Features
1. Task entry and completion
2. Quick add functionality
3. Basic views and organization
4. Offline support

### Phase 2: Enhanced Features
1. Cloud synchronization
2. Export/import functionality
3. Template system

### Phase 3: Future Enhancements
1. Customization options
2. Advanced features
3. Analytics and tracking

## Summary
BuJoGeek provides a digital alternative to traditional Bullet Journaling, maintaining simplicity while adding essential digital features. The app is designed to be intuitive, flexible, and lightweight, with a focus on user experience and extensibility.

# BuJoGeek - Digital Bullet Journal

## Development and Deployment Architecture

### Development Environment
- **Local Development**:
  - Frontend: Local Node.js/React development server
  - Backend: Local Node.js/Express development server
  - Hot-reload enabled
  - Development tools and debugging enabled
  - MongoDB connection to production container (192.168.1.17)

  **Node.js Requirements**:
  - LTS version of Node.js required
  - Local development machine runs v14
  - Use `nvm use --lts` before running any commands
  - Project includes `.nvmrc` file for version management
  - Recommended to set default Node.js version in project configuration

  **Database Connection**:
  - MongoDB runs in Docker container on production server (192.168.1.17)
  - Local development backend connects to production MongoDB
  - Connection string configured in `server/.env.local` via `DB_URI`
  - No local MongoDB instance required for development

- **Production Environment**:
  - Frontend container
  - Backend container
  - MongoDB container
  - Optimized for performance

### Environment Configuration
- Development:
  - Local development servers (frontend and backend)
  - Remote MongoDB connection to production container
  - Debug mode enabled
  - Development-specific features
  - Environment variables for local configuration
  - Node.js version management via nvm
  - `server/.env.local` for MongoDB connection configuration

- Production:
  - Containerized deployment
  - Production database
  - Performance optimizations
  - Security hardening

### Database Configuration
- Production server: 192.168.1.17
- Development connection to production DB
- Secure connection handling
- Environment-specific configurations

### Deployment Strategy
1. Development:
   - Local Node.js servers
   - Direct connection to production DB
   - Development-specific features enabled
   - Debug tools available
   - Hot-reload for rapid development

2. Production:
   - Containerized deployment
   - Production database
   - Optimized performance
   - Security measures in place

## Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
  - Server-side rendering for better performance
  - Built-in API routes
  - Excellent TypeScript support
  - Modern React features
  - Great developer experience

- **UI Framework**: Tailwind CSS
  - Utility-first CSS framework
  - Rapid development
  - Customizable design system
  - Responsive by default

- **State Management**: React Query + Zustand
  - React Query for server state
  - Zustand for client state
  - Lightweight and performant
  - Great TypeScript support

- **Form Handling**: React Hook Form
  - Performance optimized
  - TypeScript support
  - Easy validation

### Backend
- **Framework**: NestJS
  - TypeScript-first
  - Modular architecture
  - Built-in dependency injection
  - Excellent MongoDB integration
  - Strong typing and validation

- **Database**: MongoDB
  - Document-based storage
  - Flexible schema
  - Great for journal entries and tasks
  - Scalable

- **ORM**: Mongoose
  - TypeScript support
  - Schema validation
  - Query building
  - Middleware support

### Development Tools
- **Package Manager**: pnpm
  - Faster than npm/yarn
  - Disk space efficient
  - Strict dependency management

- **TypeScript**: Latest version
  - Strong typing
  - Better developer experience
  - Reduced runtime errors

- **Testing**:
  - Jest for unit testing
  - React Testing Library for frontend
  - Supertest for API testing
  - Cypress for E2E testing

- **Code Quality**:
  - ESLint
  - Prettier
  - Husky for git hooks
  - lint-staged

### Deployment
- **Containerization**: Docker
  - Consistent environments
  - Easy deployment
  - Scalable

- **CI/CD**: GitHub Actions
  - Automated testing
  - Automated deployment
  - Environment management

  I don't want to overcomplicate this, at least not at first. I want to stay pretty true to the simplicity of the BuJo.

Days are just rapid entries that get carried forward to the next day if incomplete, unless they're migrated to the low priority backlog or migrated forward to a future time.

weeks are overviews of high and medium priority tasks and scheduled items, showing 7 days at a time

months are a 29-31 day overview with high priority tasks and scheduled items

year is a 12 month view, by months, with high priority tasks and scheduled items

low priority backlog is a list of items that have been (<) migrated backwards. They are held seperate from everything else an should be occaisionally reviewed manually.