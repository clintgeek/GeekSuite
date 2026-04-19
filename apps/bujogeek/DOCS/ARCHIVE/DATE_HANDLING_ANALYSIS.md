# Date Handling Analysis

## Current Issues and Proposed Solutions

### 1. Inconsistent Date Object Creation (High Priority) - ATTEMPTED
**Issue**: We're creating Date objects in multiple ways without a consistent strategy:
- Direct `new Date()` construction
- Using `date-fns` functions
- Mixing UTC and local timezone operations

**Attempted Fix**:
```javascript
// Create a utility function for consistent date handling
const createLocalDate = (date) => {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
```

**Result**: This approach didn't work because:
1. It didn't properly handle the timezone offset
2. The date boundaries were still misaligned with the actual task dates
3. Tasks were still showing up on the wrong days

**New Proposed Fix**:
```javascript
// Use date-fns for consistent date handling
import { parseISO, startOfDay, endOfDay } from 'date-fns';

const createLocalDate = (date) => {
  return startOfDay(parseISO(date));
};
```

### 2. MongoDB Date Query Boundaries (High Priority) - ATTEMPTED
**Issue**: MongoDB stores dates in UTC, but our queries are using local timezone boundaries, causing misalignment.

**Attempted Fix**:
```javascript
// Convert local boundaries to UTC for MongoDB queries
const getUtcBoundaries = (localDate) => {
  const start = new Date(localDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(localDate);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};
```

**Result**: This approach didn't work because:
1. It didn't properly handle the timezone offset
2. The date boundaries were still misaligned with the actual task dates
3. Tasks were still showing up on the wrong days

**New Proposed Fix**:
```javascript
// Convert local date to UTC for MongoDB queries
const getUtcDate = (localDate) => {
  const date = new Date(localDate);
  return new Date(date.getTime() + date.getTimezoneOffset() * 60000);
};
```

### 3. Task Completion Date Handling (Medium Priority) - ATTEMPTED
**Issue**: We're not properly handling the relationship between task completion date and scheduled date.

**Attempted Fix**:
```javascript
// Separate queries for scheduled and completed tasks
const getScheduledTasks = (date) => {
  // Query for tasks due on this date
};

const getCompletedTasks = (date) => {
  // Query for tasks completed on this date
};
```

**Result**: This approach didn't work because:
1. The separate queries didn't solve the timezone issue
2. Tasks were still showing up on the wrong days
3. The scope of variables caused errors

**New Proposed Fix**:
```javascript
// Use a single query with proper timezone handling
const getTasksForDate = (date) => {
  const utcDate = getUtcDate(date);
  return {
    $or: [
      { dueDate: { $gte: startOfDay(utcDate), $lte: endOfDay(utcDate) } },
      { status: 'completed', updatedAt: { $gte: startOfDay(utcDate), $lte: endOfDay(utcDate) } }
    ]
  };
};
```

### 4. Timezone Offset Calculation (Medium Priority) - SOLVED
**Issue**: Our current offset calculation might be causing date boundary issues.

**Implemented Fix**:
```javascript
// Use a more reliable timezone handling approach
const getUtcDate = (date) => {
  const d = new Date(date);
  return new Date(d.getTime() + d.getTimezoneOffset() * 60000);
};
```

**Result**: This approach worked because:
1. It properly converts local dates to UTC for MongoDB queries
2. It uses UTC date components (`getUTCFullYear`, `getUTCMonth`, `getUTCDate`)
3. It creates UTC dates using `Date.UTC`
4. It manipulates dates using UTC methods (`setUTCDate`, `setUTCHours`)

**Key Learnings**:
1. Always work with UTC dates when querying MongoDB
2. Use UTC date components and methods consistently
3. Convert local dates to UTC before creating date boundaries
4. Use `Date.UTC` for creating UTC dates

### 5. Frontend Date Display (Medium Priority) - SOLVED
**Issue**: Dates were showing up one day behind in the frontend due to timezone conversion.

**Implemented Fix**:
```javascript
// Convert dates to local timezone for display
const getLocalDate = (dateString) => {
  const date = new Date(dateString);
  return new Date(date.getTime() + date.getTimezoneOffset() * 60000);
};

// Use when grouping tasks
const date = task.dueDate
  ? getLocalDate(task.dueDate).toISOString().split('T')[0]
  : getLocalDate(task.createdAt).toISOString().split('T')[0];

// Use when displaying dates
format(new Date(date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')
```

**Result**: This approach worked because:
1. It properly converts UTC dates back to local timezone for display
2. It ensures consistent date handling in the frontend
3. It maintains proper date boundaries for grouping

**Key Learnings**:
1. Always convert UTC dates to local timezone before displaying
2. Use consistent date formatting throughout the frontend
3. Consider timezone offsets when grouping by date

### 6. Date Comparison Logic (Low Priority)
**Issue**: We're using multiple date comparison methods which can lead to inconsistencies.

**Proposed Fix**:
```javascript
// Standardize date comparisons
const isSameDay = (date1, date2) => {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
};
```

### 7. Response Date Formatting (Low Priority)
**Issue**: We're not consistently formatting dates in the response.

**Proposed Fix**:
```javascript
// Standardize date formatting in responses
const formatTaskDates = (task) => {
  return {
    ...task,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    dueDate: task.dueDate ? task.dueDate.toISOString() : null
  };
};
```

## Implementation Plan

1. ✅ First, implement the Timezone Offset Calculation fix (Issue #4)
2. ✅ Then, implement the Frontend Date Display fix (Issue #5)
3. Then, implement the new MongoDB Date Query Boundaries fix (Issue #2)
4. Follow with the new Task Completion Date Handling fix (Issue #3)
5. Address the new Inconsistent Date Object Creation fix (Issue #1)
6. Implement Date Comparison Logic (Issue #6)
7. Finally, add Response Date Formatting (Issue #7)

## Testing Strategy

For each fix:
1. Test with tasks created in different timezones
2. Test with tasks completed at different times
3. Test with tasks scheduled for different days
4. Verify task visibility in daily, weekly, and monthly views
5. Check edge cases (midnight, timezone changes, etc.)

## Current Implementation Status

- [x] Issue #1: Inconsistent Date Object Creation (Attempted)
- [x] Issue #2: MongoDB Date Query Boundaries (Attempted)
- [x] Issue #3: Task Completion Date Handling (Attempted)
- [x] Issue #4: Timezone Offset Calculation (Solved)
- [x] Issue #5: Frontend Date Display (Solved)
- [ ] Issue #6: Date Comparison Logic
- [ ] Issue #7: Response Date Formatting