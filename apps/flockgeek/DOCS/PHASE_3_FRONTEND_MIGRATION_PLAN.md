# Phase 3: Frontend Migration – Implementation Plan

## Overview
Migrate FlockGeek frontend from archive to template while integrating with the new backend API structure.

## Key Differences

### Archive Frontend
- API base: `/api/flockgeek/v1`
- Auth: Via BaseGeek with token refresh handling
- Storage: `geek_token`, `geek_refresh_token`, `ownerId` in localStorage
- API client: Fetch-based with custom retry logic
- Pages: 8 pages (Login, Birds, BirdDetail, Groups, Locations, HatchLog, Pairings, EggLog)
- Components: 9 components (LineChart, LineageDisplay, HealthRecords, etc.)
- Theme: Custom theme.js

### Template Frontend
- API base: `http://localhost:4000/api` (via axios)
- Auth: Via AuthContext with client.post
- Storage: `templategeek-token` in localStorage
- API client: Axios-based with interceptors
- Pages: 2 pages (HomePage, DashboardPage)
- Components: LayoutShell, Navigation, Footer
- Theme: AppThemeProvider with theme files

## Migration Strategy

### Step 1: Update API Client
- Update `services/apiClient.js` to use new backend base URL
- Add `X-Owner-Id` header injection
- Implement token refresh logic for BaseGeek tokens
- Handle both `geek_token` and `geek_refresh_token` from BaseGeek

### Step 2: Update AuthContext
- Modify to work with BaseGeek token format
- Update localStorage keys to match archive (`geek_token`, `geek_refresh_token`, `ownerId`)
- Add refresh token logic
- Update `/auth/me` endpoint call

### Step 3: Port Pages (8 pages)
1. **Login.jsx** – Login/register with BaseGeek
2. **BirdsPage.jsx** – List all birds with filtering
3. **BirdDetailPage.jsx** – Bird detail with lineage/traits/notes
4. **GroupsPage.jsx** – List groups
5. **LocationsPage.jsx** – List locations
6. **HatchLogPage.jsx** – Hatch events
7. **PairingsPage.jsx** – Breeding pairings
8. **EggLogPage.jsx** – Egg production logs

### Step 4: Port Components (9 components)
1. **LineChart.jsx** – Charting component
2. **LineageDisplay.jsx** – Genealogy tree visualization
3. **HealthRecords.jsx** – Health record display
4. **BirdTraits.jsx** – Trait logging
5. **BirdNotes.jsx** – Note management
6. **BirdGroupManagement.jsx** – Group assignment
7. **Notifications.jsx** – Alert/notification system
8. **PageCard.jsx** – Reusable card component
9. Other utility components

### Step 5: Navigation & Routing
- Update App.jsx with new routes
- Port BottomNav and drawer navigation from archive
- Integrate with template's LayoutShell

### Step 6: Styling
- Use template's theme (MUI v5)
- Port CSS from archive/frontend/index.css
- Keep responsive design

### Step 7: Testing
- Test auth flow (login/register/logout)
- Test all pages load correctly
- Test API endpoints work
- Test navigation works
- Verify data displays correctly

## Files to Create/Update

### New Files (Pages)
- `frontend/src/pages/LoginPage.jsx`
- `frontend/src/pages/BirdsPage.jsx`
- `frontend/src/pages/BirdDetailPage.jsx`
- `frontend/src/pages/GroupsPage.jsx`
- `frontend/src/pages/LocationsPage.jsx`
- `frontend/src/pages/HatchLogPage.jsx`
- `frontend/src/pages/PairingsPage.jsx`
- `frontend/src/pages/EggLogPage.jsx`

### New Files (Components)
- `frontend/src/components/LineChart.jsx`
- `frontend/src/components/LineageDisplay.jsx`
- `frontend/src/components/HealthRecords.jsx`
- `frontend/src/components/BirdTraits.jsx`
- `frontend/src/components/BirdNotes.jsx`
- `frontend/src/components/BirdGroupManagement.jsx`

### Files to Update
- `frontend/src/services/apiClient.js` (update base URL, add ownerId header)
- `frontend/src/contexts/AuthContext.jsx` (BaseGeek token handling)
- `frontend/src/App.jsx` (add new routes)
- `frontend/src/main.jsx` (ensure all providers present)
- `frontend/package.json` (if new dependencies needed)

## Implementation Order

1. **Step 1**: Update API client → Test connectivity
2. **Step 2**: Update AuthContext → Test login/logout
3. **Step 3**: Create LoginPage → Test auth flow
4. **Step 4**: Create BirdsPage → Test listing
5. **Step 5**: Create other pages → Test all features
6. **Step 6**: Create components → Integration
7. **Step 7**: Navigation & routing → Full UX
8. **Step 8**: Styling & polish
9. **Step 9**: Full stack testing

## Estimated Scope
- ~8 page components
- ~9 UI components
- 2 service/context files
- 1 main App.jsx
- ~4-5 hours of development

## Success Criteria
- ✅ Login/register works via BaseGeek
- ✅ All 8 pages navigate and load
- ✅ API calls work (GET/POST/PUT/DELETE)
- ✅ Multi-tenant isolation (ownerId filtering)
- ✅ Token refresh works
- ✅ Logout clears auth
- ✅ Responsive design maintained
- ✅ No console errors
