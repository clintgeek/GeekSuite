/**
 * Every gateway operation GeekDay sends. All of them already existed for
 * TodoGeek and NoteGeek: GeekDay adds nothing to the gateway and changes
 * nothing in it (spec §4). Operations are named — the mobile harness stubs
 * them by name.
 */
import { gql } from '@apollo/client';

/**
 * The fields a task row needs. `recurrenceRule`, `seriesId` and
 * `isSeriesMaster` are selected so a repeating task is recognised; GeekDay
 * never sends them back (an edit that resent them as null would demote a
 * series — apps/todogeek/frontend/src/graphql/queries.js).
 */
const TASK_FIELDS = gql`
  fragment DayTaskFields on Task {
    id
    content
    signifier
    status
    priority
    tags
    dueDate
    hasDueTime
    private
    recurrenceRule
    seriesId
    isSeriesMaster
    completedAt
    cancelledAt
    createdAt
  }
`;

export const GET_DAY_TASKS = gql`
  query GetDayTasks($date: String, $tzOffsetMinutes: Int) {
    dailyTasks(date: $date, tzOffsetMinutes: $tzOffsetMinutes) {
      ...DayTaskFields
    }
  }
  ${TASK_FIELDS}
`;

export const SET_DAY_TASK_STATUS = gql`
  mutation SetDayTaskStatus($id: ID!, $status: String!) {
    updateTaskStatus(id: $id, status: $status) {
      ...DayTaskFields
    }
  }
  ${TASK_FIELDS}
`;

/** Move one task (one occurrence of a repeating one) to another day. */
export const MOVE_DAY_TASK = gql`
  mutation MoveDayTask($id: ID!, $input: UpdateTaskInput!) {
    updateTask(id: $id, input: $input, editScope: THIS_INSTANCE) {
      ...DayTaskFields
    }
  }
  ${TASK_FIELDS}
`;

export const CREATE_DAY_TASK = gql`
  mutation CreateDayTask(
    $content: String!
    $signifier: String
    $priority: Int
    $tags: [String]
    $dueDate: Date
    $note: String
    $recurrenceRule: String
    $private: Boolean
    $clientId: String
    $hasDueTime: Boolean
    $timeZone: String
  ) {
    createTask(
      content: $content
      signifier: $signifier
      priority: $priority
      tags: $tags
      dueDate: $dueDate
      note: $note
      recurrenceRule: $recurrenceRule
      private: $private
      clientId: $clientId
      hasDueTime: $hasDueTime
      timeZone: $timeZone
    ) {
      ...DayTaskFields
    }
  }
  ${TASK_FIELDS}
`;

/**
 * The day's page: the NoteGeek sketch carrying the exact-match day tag.
 * There is at most one in normal use; two devices creating at the same moment
 * can leave two, so a few are read and the oldest wins (hooks/useDayNote.js).
 */
export const FIND_DAY_NOTE = gql`
  query FindDayNote($tag: String!) {
    notes(tag: $tag, type: "handwritten", limit: 5, sort: "createdAt_asc") {
      id
      title
      content
      tags
      archived
      deletedAt
      createdAt
      updatedAt
    }
  }
`;

/** Write answers never select `content`: a sketch is megabytes. */
export const CREATE_DAY_NOTE = gql`
  mutation CreateDayNote($title: String, $content: String!, $tags: [String!]) {
    createNote(title: $title, content: $content, type: "handwritten", tags: $tags) {
      id
      title
      tags
      createdAt
      updatedAt
    }
  }
`;

export const SAVE_DAY_NOTE = gql`
  mutation SaveDayNote($id: ID!, $content: String!, $baseUpdatedAt: String) {
    updateNote(id: $id, content: $content, baseUpdatedAt: $baseUpdatedAt) {
      id
      updatedAt
    }
  }
`;

/**
 * Read circled handwriting. No `noteId` on purpose: with one, the gateway
 * stores the answer as the WHOLE note's transcript, and a crop would replace
 * the page's real one.
 */
export const READ_CIRCLED_INK = gql`
  mutation ReadCircledInk($image: String!, $mediaType: String!) {
    transcribeSketch(image: $image, mediaType: $mediaType, source: "sketch") {
      text
    }
  }
`;

// ── The week spread (DOCS/GEEKDAY_SPEC.md §6) ─────────────────────────────

/**
 * Everything due in one Monday-to-Sunday week. `weeklyTasks(date)` snaps
 * `date` to the Monday of its week itself (taskService.startOfUtcWeek), so
 * the week page always sends the Monday. What it answers, and what it does
 * not, is written up in hooks/useWeekTasks.js.
 */
export const GET_WEEK_TASKS = gql`
  query GetWeekTasks($date: String, $tzOffsetMinutes: Int) {
    weeklyTasks(date: $date, tzOffsetMinutes: $tzOffsetMinutes) {
      ...DayTaskFields
    }
  }
  ${TASK_FIELDS}
`;

/**
 * Today's list, read for its overdue and undated tasks: the week page's
 * "Not scheduled" cell. The same field as GET_DAY_TASKS under its own name,
 * so the two pages can be told apart in a log (and stubbed apart in the
 * harness).
 */
export const GET_UNSCHEDULED_TASKS = gql`
  query GetUnscheduledTasks($date: String, $tzOffsetMinutes: Int) {
    dailyTasks(date: $date, tzOffsetMinutes: $tzOffsetMinutes) {
      ...DayTaskFields
    }
  }
  ${TASK_FIELDS}
`;

/** One day's ink page, for its picture on the week spread. Same lookup as FIND_DAY_NOTE. */
export const FIND_WEEK_DAY_NOTE = gql`
  query FindWeekDayNote($tag: String!) {
    notes(tag: $tag, type: "handwritten", limit: 5, sort: "createdAt_asc") {
      id
      content
      archived
      deletedAt
      createdAt
    }
  }
`;
