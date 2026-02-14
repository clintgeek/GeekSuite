# FlockGeek Frontend + Backend - Testing Guide

## Current System Status ✅

Both servers are running:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5001

## Quick Start Testing

### 1. Login Flow
1. Go to http://localhost:5173
2. You should see the LoginPage with two options: "Sign In" and "Create Account"
3. Try signing in with BaseGeek credentials:
   - Username/Email: (use your BaseGeek account)
   - Password: (your password)
4. On success:
   - Tokens should be stored in localStorage (geek_token, geek_refresh_token, ownerId)
   - Should redirect to home page (`/`)
   - Navigation bar should appear

### 2. Navigation Testing
Once logged in, click on each navigation link and verify the page loads:
- ✅ Home (/)
- ✅ Birds (/birds)
- ✅ Groups (/groups)
- ✅ Locations (/locations)
- ✅ Pairings (/pairings)
- ✅ Egg Log (/egg-log)
- ✅ Hatch Log (/hatch-log)

### 3. Data Pages - Quick Tests

#### Birds Page
- [ ] Load `/birds` - should display bird table
- [ ] Check pagination dropdown (5, 10, 25 rows)
- [ ] Apply filters:
  - [ ] Search by name/tagId
  - [ ] Filter by status (active, meat run, retired)
  - [ ] Filter by sex
  - [ ] Filter by breed
- [ ] Click Delete button on any bird
- [ ] Verify soft-delete (bird disappears from table)

#### Groups Page
- [ ] Load `/groups` - should display groups table
- [ ] Apply filters:
  - [ ] Search by name
  - [ ] Filter by purpose (layer_flock, breeder_flock, meat_flock, brooder, other)
- [ ] Verify status chip shows Active/Inactive based on date range
- [ ] Click Delete button

#### Locations Page
- [ ] Load `/locations`
- [ ] Apply filters by name and type
- [ ] Verify type chips display correct colors

#### Pairings Page
- [ ] Load `/pairings`
- [ ] Apply filters by name and status
- [ ] Verify rooster/hen counts display

#### Egg Log Page
- [ ] Load `/egg-log`
- [ ] Filter by date range (start/end date)
- [ ] Filter by quality (excellent, good, fair, poor)
- [ ] Verify success rate calculation if available

#### Hatch Log Page
- [ ] Load `/hatch-log`
- [ ] Filter by date range
- [ ] Verify success rate % is calculated (chicksHatched / eggsSet * 100)
- [ ] Status should show "Hatched" or "Incubating"

## Network Testing (Browser DevTools)

1. Open Browser DevTools (F12)
2. Go to Network tab
3. Click on any data page (e.g., Birds)
4. Look for API calls to `http://localhost:5001/api/birds`
5. Check the request headers:
   - [ ] `Authorization: Bearer <token>` should be present
   - [ ] `X-Owner-Id: <ownerId>` should be present
6. Response should include:
   - [ ] `data.data.birds[]` array
   - [ ] `data.data.pagination` with total count

### Example Network Headers

**Request:**
```
GET /api/birds?page=1&limit=10 HTTP/1.1
Host: localhost:5001
Authorization: Bearer eyJhbGc...
X-Owner-Id: 507f1f77bcf86cd799439011
```

**Response:**
```json
{
  "data": {
    "birds": [
      {
        "_id": "...",
        "tagId": "001",
        "name": "Henny",
        "sex": "hen",
        "breed": "Wyandotte",
        "status": "active",
        "hatchDate": "2023-01-15T00:00:00Z",
        "createdAt": "...",
        "updatedAt": "..."
      }
    ],
    "pagination": {
      "total": 42,
      "page": 1,
      "limit": 10,
      "pages": 5
    }
  }
}
```

## Storage Testing (Browser DevTools)

1. Open Browser DevTools (F12)
2. Go to Application tab → Storage → Local Storage
3. You should see:
   - `geek_token` - JWT token
   - `geek_refresh_token` - Refresh token
   - `ownerId` - Multi-tenant owner ID
4. Click a data page to load birds
5. Go back to Storage and see token is still there

## Logout Testing

1. Click the Logout button in the top-right menu
2. Should be redirected to `/login`
3. LocalStorage keys should be cleared
4. Try accessing a protected route directly (e.g., `/birds`)
5. Should redirect to `/login` immediately

## Token Refresh Testing (Advanced)

1. Open DevTools → Application → Storage
2. Copy the `geek_token` value
3. Manually corrupt it by changing a few characters
4. Go to any data page (e.g., `/birds`)
5. Expected behavior:
   - First API call fails with 401
   - System automatically calls `/auth/refresh`
   - New token is obtained and stored
   - Original request is retried with new token
   - Data displays normally

## Error Scenarios

### Scenario 1: Wrong Credentials
- Go to login page
- Enter invalid BaseGeek credentials
- Should see error alert

### Scenario 2: Network Error
- Stop backend: `pkill -f "node src/server.js"`
- Try to load any data page
- Should see error alert: "Failed to fetch birds"
- Backend should auto-reconnect when restarted

### Scenario 3: Missing Authorization Header
- Open DevTools → Network tab
- Open backend `http://localhost:5001/api/birds` directly (no auth header)
- Should get 403 error

## Performance Testing

### Load Testing
1. Go to `/birds` page
2. Open DevTools → Network
3. Set throttling to "Slow 3G"
4. Wait for page to load
5. Should see loading spinner during load
6. Data should eventually display

### Pagination Performance
1. Go to any data page with 1000+ records
2. Change to "25 rows per page"
3. Navigate through pages
4. Should be responsive

## Checklist Summary

- [ ] Backend running on :5001
- [ ] Frontend running on :5173
- [ ] Can load http://localhost:5173
- [ ] Can login with BaseGeek credentials
- [ ] Redirect to home page after login
- [ ] Navigation bar appears
- [ ] Can access all 6 data pages via navigation
- [ ] Birds page loads data in table
- [ ] Filtering works on Birds page
- [ ] Pagination works (change rows per page)
- [ ] Delete button works (soft-delete)
- [ ] Delete is reflected immediately in UI
- [ ] Network tab shows Authorization header
- [ ] Network tab shows X-Owner-Id header
- [ ] LocalStorage has geek_token, geek_refresh_token, ownerId
- [ ] Can logout
- [ ] After logout, LocalStorage is cleared
- [ ] Protected routes redirect to /login when logged out

## Debugging Tips

### Check Backend Logs
```bash
# Watch backend logs in real-time
tail -f backend/logs/*.log

# Or check terminal where backend is running
# (should see [INFO] messages)
```

### Check Browser Console
Press F12 in browser, go to Console tab. Look for:
- React warnings/errors
- Network errors
- Auth errors

### Check Network Activity
Press F12, go to Network tab:
- Filter by XHR/Fetch
- Click any API request
- Check Request/Response headers and body

### Restart Servers
If something breaks:
```bash
# Stop both servers (Ctrl+C in each terminal)

# Restart backend
cd backend && npm run dev

# Restart frontend (in another terminal)
cd frontend && npm run dev
```

### Clear All Data
To reset to seed data:
```bash
cd backend
npm run seed
```

This will:
1. Clear all data for SEED_OWNER_ID
2. Create demo birds, groups, locations, pairings, hatch events, egg production, health records

## What's Working

✅ **Auth Flow**
- LoginPage with BaseGeek integration
- Token storage (geek_token, geek_refresh_token, ownerId)
- Protected routes with redirect
- Logout functionality

✅ **API Integration**
- Request interceptor (Authorization + X-Owner-Id headers)
- Response interceptor (token refresh on 401)
- Error handling with Alert display
- Pagination support

✅ **Data Pages**
- BirdsPage with filtering, sorting, pagination, delete
- GroupsPage with all CRUD UI
- LocationsPage with all CRUD UI
- PairingsPage with all CRUD UI
- EggLogPage with date filtering
- HatchLogPage with hatch calculations

✅ **Navigation**
- Top navigation with all links
- Mobile drawer support
- Logout button

## What's Not Yet Complete

⏳ **Create/Edit Forms**
- Add Bird button opens dialog (TODO in code)
- Forms for editing each entity
- Form validation

⏳ **Detail Pages**
- BirdDetailPage with lineage tree
- Bird traits (time-series data)
- Bird notes
- Health records for bird

⏳ **Dashboard**
- Stats dashboard on home page
- Charts/graphs
- Summary widgets

⏳ **Advanced Features**
- Lineage/pedigree trees
- Reports
- Export functionality
- Advanced search/filters

## Next Phase Tasks

1. **Create CRUD Dialog Forms** - Modal/Dialog for add/edit operations
2. **Create BirdDetailPage** - Show full bird profile with related data
3. **Create Supporting Components**:
   - LineageDisplay - Genealogy visualization
   - HealthRecords - Health record form/display
   - BirdTraits - Physical traits logging
   - BirdNotes - Notes display/edit
4. **Phase 4** - Docker, deployment, production build

