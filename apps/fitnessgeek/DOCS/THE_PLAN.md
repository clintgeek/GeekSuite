# FitnessGeek Issue Resolution Plan

## Overview

This document outlines the plan to address the current issues in FitnessGeek. Each issue is analyzed with root cause and proposed solution.

---

## Issue 1: Will Not Stay Logged In

### Symptoms
- Users get logged out unexpectedly
- Session doesn't persist across browser sessions or page refreshes

### Root Cause Analysis
The app uses GeekSuite SSO with cookie-based auth (`geek_token` cookie). Potential causes:
1. **Cookie expiration** - JWT tokens may have short expiry without proper refresh
2. **Cookie scope** - `geek_token` cookie may not be set with correct `domain`/`path`/`SameSite` attributes for cross-origin requests
3. **Missing token refresh** - No automatic token refresh before expiry
4. **CORS/credentials** - Backend may not be properly handling credentialed requests

### Files to Investigate
- `@/Users/ccrocker/projects/fitnessGeek/frontend/src/utils/authClient.js` - Auth client
- `@/Users/ccrocker/projects/fitnessGeek/frontend/src/contexts/AuthContext.jsx` - Auth state management
- `@/Users/ccrocker/projects/fitnessGeek/backend/src/middleware/auth.js` - Token verification
- BaseGeek token issuance (cookie settings)

### Proposed Solution
1. Add token refresh mechanism before expiry
2. Verify cookie attributes (`SameSite=None; Secure` for cross-origin, or `SameSite=Lax` for same-site)
3. Add periodic session validation (e.g., every 5 minutes)
4. Handle 401 responses gracefully with redirect to login

### Priority: **HIGH**

---

## Issue 2: Multi-Add Not Working

### Symptoms
- When searching for composite queries like "2 tacos and a beer", selecting multiple items and adding them all doesn't work correctly

### Root Cause Analysis
Looking at `@/Users/ccrocker/projects/fitnessGeek/frontend/src/components/FoodSearch/UnifiedFoodSearch.jsx`:
- `handleAddAllSelected()` sets up a queue (`pendingSelectionQueue`) and processes items one at a time
- The queue processing may not be completing properly after the first item is added
- State updates may be racing or the modal close callback may not trigger the next item

### Files to Investigate
- `@/Users/ccrocker/projects/fitnessGeek/frontend/src/components/FoodSearch/UnifiedFoodSearch.jsx:72-88` - Multi-add logic
- `@/Users/ccrocker/projects/fitnessGeek/frontend/src/components/FoodSearch/AddFoodModal.jsx` - Modal that processes each item

### Proposed Solution
1. Debug the queue processing flow - ensure `onFoodSelect` callback triggers next item in queue
2. Add proper state management for multi-add flow
3. Consider batch API endpoint for adding multiple foods at once
4. Add visual feedback showing progress through the queue

### Priority: **HIGH**

---

## Issue 3: Need to See More Than 3 Results in Food Search

### Symptoms
- Food search only shows 3 results, limiting user choice

### Root Cause Analysis
Looking at `@/Users/ccrocker/projects/fitnessGeek/backend/src/services/unifiedFoodService.js:131`:
- `applySanityCheck(trimmedQuery, results, 3)` limits to 3 results after AI validation
- This was intentional for "high confidence" results but is too restrictive for browsing

### Files to Investigate
- `@/Users/ccrocker/projects/fitnessGeek/backend/src/services/unifiedFoodService.js:131` - Sanity check limit
- `@/Users/ccrocker/projects/fitnessGeek/frontend/src/components/FoodSearch/UnifiedFoodSearch.jsx:42` - `maxResults` prop

### Proposed Solution
1. Increase sanity check limit from 3 to 10 (or make configurable)
2. Show results in tiers: "Best Matches" (top 3) + "More Results" (expandable)
3. Allow user to configure result count in settings
4. For composite queries, show 3-5 per item instead of 2-4

### Priority: **MEDIUM**

---

## Issue 4: Should Prioritize Recent and Custom Foods

### Symptoms
- Recent foods and custom foods don't appear at the top of search results
- Users have to scroll past API results to find their own foods

### Root Cause Analysis
Looking at `@/Users/ccrocker/projects/fitnessGeek/frontend/src/FoodSearch.jsx:216-227`:
- Frontend sorts meals first, then custom, then alphabetically
- But backend search (`unifiedFoodService.search`) doesn't query local DB first
- Recent foods are only shown when there's no search query

### Files to Investigate
- `@/Users/ccrocker/projects/fitnessGeek/backend/src/services/unifiedFoodService.js` - Search routing
- `@/Users/ccrocker/projects/fitnessGeek/backend/src/routes/foodRoutes.js:165-228` - Recent foods endpoint

### Proposed Solution
1. **Backend**: Query local DB (custom + recent) FIRST before external APIs
2. **Backend**: Include user's recent foods in search results with boost
3. **Frontend**: Merge local results at top of API results
4. Add "frequency score" - foods logged more often rank higher
5. Consider separate sections: "Your Foods" | "Search Results"

### Priority: **HIGH**

---

## Issue 5: Quick Add / Favorites Not Working

### Symptoms
- Quick Add panel shows empty or errors
- Favorites don't load or can't be added

### Root Cause Analysis
Looking at `@/Users/ccrocker/projects/fitnessGeek/frontend/src/components/FoodLog/QuickAddPanel.jsx`:
- Calls `foodService.getFavorites()` and `foodService.getRecent()`
- Backend endpoints exist at `/api/foods/favorites` and `/api/foods/recent`
- Issue may be:
  1. Foods not being saved to local DB (only API results, no `_id`)
  2. `favorite_foods` array in UserSettings contains invalid IDs
  3. FoodLog aggregation using wrong field (`food_item_id` vs populated object)

### Files to Investigate
- `@/Users/ccrocker/projects/fitnessGeek/backend/src/routes/foodRoutes.js:81-228` - Favorites/Recent endpoints
- `@/Users/ccrocker/projects/fitnessGeek/backend/src/models/UserSettings.js` - Favorites storage
- `@/Users/ccrocker/projects/fitnessGeek/backend/src/models/FoodLog.js` - Log structure

### Proposed Solution
1. Ensure API foods are saved to local DB before logging (so they have `_id`)
2. Add validation when adding favorites (check food exists)
3. Fix recent foods aggregation to handle both ObjectId and embedded food data
4. Add error handling and user feedback when favorites fail

### Priority: **HIGH**

---

## Issue 6: Parse Brand Names Better

### Symptoms
- Brand names not extracted correctly from queries
- "Starbucks grande latte" might not recognize "Starbucks" as brand

### Root Cause Analysis
AI classification in `baseGeekAIService.classifyFoodInput()` handles brand detection.
Issues may be:
1. AI prompt not specific enough about brand extraction
2. Brand list not comprehensive
3. Classification caching may return stale results

### Files to Investigate
- `@/Users/ccrocker/projects/fitnessGeek/backend/src/services/baseGeekAIService.js` - AI classification
- `@/Users/ccrocker/projects/fitnessGeek/backend/src/services/aiClassificationCacheService.js` - Cache

### Proposed Solution
1. Improve AI classification prompt with more brand examples
2. Add common brand list for pre-classification hints
3. Handle brand variations (e.g., "McD's" → "McDonald's")
4. Log classification results for analysis and improvement
5. Consider hybrid approach: regex for known brands + AI for unknown

### Priority: **MEDIUM**

---

## Issue 7: Lookup is SLOW

### Symptoms
- Food search takes several seconds to return results
- UI feels unresponsive during search

### Root Cause Analysis
Looking at `@/Users/ccrocker/projects/fitnessGeek/backend/src/services/unifiedFoodService.js`:
1. **Sequential API calls**: Some searches hit multiple APIs sequentially
2. **AI classification**: Every search calls AI for classification (even if cached miss)
3. **AI sanity check**: Results go through AI scoring after retrieval
4. **No early termination**: Searches all sources even if first returns good results

Current flow for generic search:
1. AI Classification (network call)
2. USDA API (network call)
3. OpenFoodFacts API (network call)
4. CalorieNinjas API (network call)
5. AI Scoring (network call)
6. Deduplication

### Files to Investigate
- `@/Users/ccrocker/projects/fitnessGeek/backend/src/services/unifiedFoodService.js` - Main search logic
- `@/Users/ccrocker/projects/fitnessGeek/backend/src/services/foodApiService.js` - USDA/OFF calls
- `@/Users/ccrocker/projects/fitnessGeek/backend/src/services/fatSecretService.js` - FatSecret calls
- `@/Users/ccrocker/projects/fitnessGeek/DOCS/THE_LOOKUP_PLAN.md` - Existing optimization plan

### Proposed Solution
1. **Parallel API calls**: Search USDA + OFF + CalorieNinjas simultaneously
2. **Early termination**: If first source returns 5+ high-confidence results, skip others
3. **Cache aggressively**: Cache API results for 7 days (already done), cache AI classification
4. **Skip AI scoring for simple queries**: Only use AI sanity check for composite/ambiguous
5. **Local-first**: Check local DB before external APIs
6. **Debounce frontend**: Already 500ms debounce, consider increasing to 750ms
7. **Streaming results**: Return local results immediately, append API results

### Priority: **HIGH**

---

## Implementation Order

| Phase | Issues | Rationale |
|-------|--------|-----------|
| **Phase 1** | #1 (Auth), #5 (Quick Add) | Core functionality - users can't use app without auth |
| **Phase 2** | #7 (Speed), #4 (Prioritization) | UX improvements - make search usable |
| **Phase 3** | #2 (Multi-Add), #3 (More Results) | Feature fixes |
| **Phase 4** | #6 (Brand Parsing) | Polish |

---

## Success Metrics

- [ ] Users stay logged in for 7+ days without re-auth
- [ ] Multi-add successfully logs all selected items
- [ ] Search shows 10+ results by default
- [ ] User's custom/recent foods appear in top 5 results
- [ ] Quick Add panel loads favorites and recent foods
- [ ] Brand queries route to FatSecret correctly
- [ ] Average search time < 1.5 seconds

---

## Notes

- Existing `THE_LOOKUP_PLAN.md` has detailed architecture for food lookup optimization
- GeekSuite SSO is shared across apps - auth fixes may need coordination with BaseGeek
- Consider A/B testing result count (3 vs 10) to measure user preference
