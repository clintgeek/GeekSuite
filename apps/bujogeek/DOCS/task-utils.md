# Task Utilities Documentation

## Overview

The task utilities provide a centralized way to filter and group tasks by date across all views in the application. This ensures consistent behavior and reduces code duplication.

## Core Function: `getTasksForDates`

The main utility function that handles task filtering and grouping.

### Parameters

```typescript
getTasksForDates(
  tasks: Task[],
  options: {
    startDate?: Date,
    endDate?: Date,
    today?: Date,
    filters?: Object,
    includeCompleted?: boolean,
    includeUnscheduled?: boolean,
    includePastDue?: boolean
  }
)
```

### Return Value

Returns an object where:
- Keys are dates in 'yyyy-MM-dd' format
- Values are arrays of tasks for that date

### Example Usage

```javascript
// Daily view
const dailyTasks = getTasksForDates(tasks, {
  startDate: today,
  endDate: today,
  includeCompleted: true,
  includeUnscheduled: true,
  includePastDue: true
});

// Weekly view
const weeklyTasks = getTasksForDates(tasks, {
  startDate: startOfWeek(today),
  endDate: endOfWeek(today),
  includeCompleted: true,
  includeUnscheduled: true,
  includePastDue: true
});

// Monthly view
const monthlyTasks = getTasksForDates(tasks, {
  startDate: startOfMonth(today),
  endDate: endOfMonth(today),
  includeCompleted: true,
  includeUnscheduled: true,
  includePastDue: true
});
```

## Task Filtering Rules

The utility follows these rules for determining where tasks appear:

1. **Completed Tasks**
   - Show on their completion date (updatedAt)
   - Can be excluded with `includeCompleted: false`

2. **Tasks with Due Dates**
   - Future tasks: Show on their due date
   - Past due tasks: Show on today
   - Today's tasks: Show on today
   - Can exclude past due tasks with `includePastDue: false`

3. **Unscheduled Tasks**
   - Show on today
   - Can be excluded with `includeUnscheduled: false`

## Task Sorting

Tasks within each date are sorted by:
1. Priority (ascending)
2. Due date (ascending)
3. Creation date (ascending)

## Integration with Views

### Weekly View Example

```javascript
// In the component
const { tasks, fetchWeeklyTasks } = useTaskContext();
const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: 1 });

useEffect(() => {
  fetchWeeklyTasks(weekStart, weekEnd);
}, [selectedWeek]);

// In the controller
const groupedTasks = getTasksForDates(tasks, {
  startDate: new Date(startDate),
  endDate: new Date(endDate),
  today,
  includeCompleted: true,
  includeUnscheduled: true,
  includePastDue: true
});
```

## Best Practices

1. **Date Normalization**
   - Always normalize dates by setting hours to 0
   - Use consistent date formatting ('yyyy-MM-dd')

2. **Performance**
   - The utility is optimized for performance
   - Tasks are only processed once
   - Sorting is done per date, not globally

3. **Error Handling**
   - Invalid dates are handled gracefully
   - Missing tasks return empty arrays
   - Null/undefined values are handled safely

## Migration Guide

When migrating existing views to use this utility:

1. Remove any local task filtering logic
2. Update the controller to use `getTasksForDates`
3. Update the component to expect the new data structure
4. Test edge cases (past due, completed, unscheduled tasks)

## Common Issues

1. **Tasks Not Showing**
   - Check if the date range includes the task's date
   - Verify the task's status and due date
   - Check if the task is excluded by filters

2. **Performance Issues**
   - Ensure you're not processing the same tasks multiple times
   - Use appropriate date ranges
   - Consider pagination for large task sets