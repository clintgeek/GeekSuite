# Repeating Tasks Implementation Plan

Provide a brief description of the problem, any background context, and what the change accomplishes.
Currently, BuJoGeek handles recurring tasks by spawning the next instance *only when* the current instance is completed. Furthermore, uncompleted tasks naturally carry forward to the next day in standard bullet journal fashion. This results in a weekly task showing up every day until it's checked off. Also, since there is no concept of a "Series", users cannot edit or delete all future occurrences at once. 

This plan will bring repeating tasks on par with Google Calendar/Outlook by introducing RRULE-based virtual recurrence, series grouping, and instance override handling.

## User Review Required

> [!WARNING]
> This requires introducing the `rrule` npm package to `apps/basegeek/packages/api` to robustly handle complex repeating rules. Please let me know if adding this dependency is acceptable.

> [!IMPORTANT]
> How should we handle existing repeating tasks? They currently lack an `rrule` or `seriesId`. I propose we run a migration script (or write a fallback in the UI) to upgrade existing tasks with `recurrencePattern: 'weekly'` to a standard RRULE and mark them as series masters.

## Open Questions

1. **"Carry Forward" Logic vs Calendar Logic**: For a weekly task that was due Monday but wasn't completed, should it *still* show up on Tuesday as past-due (bullet journal style), or should it strictly stay on Monday (calendar style)? Google Calendar keeps the event on Monday, but a To-Do app usually carries it forward. I plan to use Calendar style for the *date placement* but keep it flagged as past-due. Let me know your preference.
2. **Offline Support**: BuJoGeek seems to use Apollo Client. The backend will generate virtual instances. This is standard, but means offline creation of virtual future instances might be limited until synced. Is this acceptable?

## Proposed Changes

### apps/basegeek/packages/api

#### [MODIFY] package.json
- Add `rrule` to dependencies.

#### [MODIFY] src/graphql/bujogeek/models/Task.js
- Add `seriesId: { type: String, default: null }`
- Add `recurrenceRule: { type: String, default: null }`
- Add `isSeriesMaster: { type: Boolean, default: false }`
- Add `originalDueDate: { type: Date, default: null }`

#### [MODIFY] src/graphql/bujogeek/typeDefs.js
- Update `Task` type to include new fields.
- Add `EditScope` enum (`THIS_INSTANCE`, `ALL_INSTANCES`, `FUTURE_INSTANCES`).
- Update `updateTask` and `deleteTask` mutations to accept `editScope`.

#### [MODIFY] src/graphql/bujogeek/services/taskService.js
- Refactor `getTasksForDateRange`:
  - Fetch all `isSeriesMaster: true` tasks.
  - Expand their RRULEs for the requested date window.
  - Map virtual instances and merge them with materialized database instances (overwriting virtuals if a materialized override exists).
- Refactor `updateTask` and `deleteTask` to handle `editScope` logic (e.g. creating an override instance for `THIS_INSTANCE` vs modifying the master for `ALL_INSTANCES`).

---

### apps/bujogeek/frontend

#### [MODIFY] src/graphql/mutations.js
- Add `editScope` to `UPDATE_TASK` and `DELETE_TASK` definitions.

#### [MODIFY] src/context/TaskContext.jsx
- Update `updateTask` and `deleteTask` functions to accept and pass `editScope` down to the mutations.

#### [NEW] src/components/tasks/RecurringEditDialog.jsx
- Create a new MUI Dialog component that prompts the user: "Edit repeating task: This instance, or All instances?" when they attempt to modify or delete a recurring task.

#### [MODIFY] src/components/tasks/TaskRow.jsx & TaskEditor.jsx
- Integrate `RecurringEditDialog.jsx` to intercept edit/delete actions for tasks with a `seriesId`.
- Display a small repeat/sync icon on tasks that belong to a series.

## Verification Plan

### Automated Tests
- If applicable, run GraphQL API tests to verify virtual instance generation and override handling.

### Manual Verification
1. Create a `(weekly)` task on Monday.
2. Verify it only shows up on Mondays in the weekly and monthly views, without materializing in the database.
3. Edit the following Monday's instance. Select "This instance".
4. Verify a new materialized task is created for that Monday and the rest of the series remains intact.
5. Delete the entire series and verify all instances disappear.
