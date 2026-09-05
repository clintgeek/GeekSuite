/**
 * cacheUpdates.js — the `update` functions the rule in `apolloClient.js`
 * describes, in one place so a mutation site is a single line rather than a
 * paragraph of cache surgery.
 *
 * Every export here has the same shape Apollo's `update` option wants —
 * `(cache, { data }) => void`, sometimes behind a small factory that takes
 * what the mutation result cannot tell us (the id of a deleted row, the
 * collection a task used to be in). None of them read the network.
 *
 * Nothing in here throws. A cache update that fails must never take a
 * successful write down with it, so the field evictions are unconditional and
 * the list rewrites tolerate a missing field.
 */

/**
 * Fields the gateway computes from tasks. When a task is created, deleted, or
 * moves in or out of a collection, these are the values that silently stopped
 * being true — and that the client cannot recompute for itself.
 *
 * Evicting a ROOT field is the cheap move: it marks the field missing, so the
 * `cache-and-network` queries reading it refetch just that field the next time
 * they run, and nothing else in the cache is disturbed.
 */
const TASK_DERIVED_ROOT_FIELDS = ['taskTags', 'collections'];

/** Evict the derived root fields, plus a specific collection's counts. */
const evictTaskDerived = (cache, collectionIds = []) => {
  for (const fieldName of TASK_DERIVED_ROOT_FIELDS) {
    cache.evict({ id: 'ROOT_QUERY', fieldName });
  }
  // A single collection's own document carries the same counts. `collection`
  // is a keyed root field, so evict the entity's fields rather than the root.
  for (const collectionId of new Set(collectionIds.filter(Boolean).map(String))) {
    const ref = cache.identify({ __typename: 'Collection', id: collectionId });
    if (!ref) continue;
    cache.evict({ id: ref, fieldName: 'taskCount' });
    cache.evict({ id: ref, fieldName: 'completedCount' });
    cache.evict({ id: ref, fieldName: 'tasks' });
  }
  cache.gc();
};

/* ─── Tasks ──────────────────────────────────────────────────────────────── */

/**
 * A task was created. Clause 3: the tag index and every collection tally the
 * gateway derives are now wrong. There is no cached list of log tasks to add
 * it to (see the documented exception in `apolloClient.js`), so membership
 * needs nothing here.
 */
export const onTaskCreated = (cache, { data }) => {
  const task = data?.createTask ?? data?.addSubtask;
  evictTaskDerived(cache, [task?.collectionId]);
};

/**
 * A task was updated. Its own fields merge themselves (clause 1); what does
 * not is the pair of collections it may have moved BETWEEN — the one it left
 * has to be named by the caller, because the result only knows where it
 * landed.
 */
export const onTaskUpdated = (previousCollectionId) => (cache, { data }) => {
  const task = data?.updateTask ?? data?.migrateTaskToFuture;
  evictTaskDerived(cache, [task?.collectionId, previousCollectionId]);
};

/**
 * A task's status changed (complete / uncomplete / cancel / block / unblock).
 * The entity merges itself; a collection's `completedCount` does not.
 */
export const onTaskStatusChanged = (collectionId) => (cache, { data }) => {
  const task =
    data?.updateTaskStatus ?? data?.blockTask ?? data?.unblockTask ?? null;
  evictTaskDerived(cache, [task?.collectionId ?? collectionId]);
};

/**
 * A task was deleted. Clause 2 in full: drop the entity so no cached list can
 * hold a dangling reference to it, then clause 3 for the derived tallies.
 *
 * `deleteTask` returns only `{ success }`, so the id and the collection have
 * to be closed over from the call site — which is exactly why this is a
 * factory.
 */
export const onTaskDeleted = (taskId, collectionId) => (cache, { data }) => {
  if (data?.deleteTask && data.deleteTask.success === false) return;
  const ref = cache.identify({ __typename: 'Task', id: String(taskId) });
  if (ref) cache.evict({ id: ref });
  evictTaskDerived(cache, [collectionId]);
};

/* ─── Subtasks ───────────────────────────────────────────────────────────── */

/**
 * A step was added to `parentId`. Clause 2: the parent's `subtasks` array is a
 * membership list, so append the new child's reference to it — that is what
 * moves the `2/5` chip without refetching the parent.
 */
export const onSubtaskAdded = (parentId) => (cache, { data }) => {
  const subtask = data?.addSubtask;
  if (!subtask) return;
  const parentRef = cache.identify({ __typename: 'Task', id: String(parentId) });
  if (!parentRef) return;

  cache.modify({
    id: parentRef,
    fields: {
      subtasks(existing = [], { toReference, readField }) {
        const ref = toReference(subtask);
        if (!ref) return existing;
        const already = existing.some((child) => readField('id', child) === subtask.id);
        return already ? existing : [...existing, ref];
      },
    },
  });
  evictTaskDerived(cache, [subtask.collectionId]);
};

/**
 * A step was removed. The child is deleted like any other task; the parent's
 * array is the membership list that has to lose it.
 */
export const onSubtaskRemoved = (parentId, subtaskId) => (cache, { data }) => {
  if (data?.deleteTask && data.deleteTask.success === false) return;
  const parentRef = cache.identify({ __typename: 'Task', id: String(parentId) });
  if (parentRef) {
    cache.modify({
      id: parentRef,
      fields: {
        subtasks(existing = [], { readField }) {
          return existing.filter(
            (child) => String(readField('id', child)) !== String(subtaskId)
          );
        },
      },
    });
  }
  const childRef = cache.identify({ __typename: 'Task', id: String(subtaskId) });
  if (childRef) cache.evict({ id: childRef });
  cache.gc();
};

/* ─── Collections ────────────────────────────────────────────────────────── */

/** Clause 2: a new collection joins the `collections` root list. */
export const onCollectionCreated = (cache, { data }) => {
  const collection = data?.createCollection;
  if (!collection) return;
  cache.modify({
    fields: {
      collections(existing = [], { toReference, readField }) {
        const ref = toReference(collection);
        if (!ref) return existing;
        if (existing.some((c) => readField('id', c) === collection.id)) return existing;
        // The gateway sorts unarchived-first then alphabetical; inserting in
        // that order keeps the list stable until the next real read.
        const next = [...existing, ref];
        return next.sort((a, b) => {
          const aArchived = Boolean(readField('archived', a));
          const bArchived = Boolean(readField('archived', b));
          if (aArchived !== bArchived) return aArchived ? 1 : -1;
          return String(readField('name', a) ?? '').localeCompare(String(readField('name', b) ?? ''));
        });
      },
    },
  });
};

/**
 * A collection was deleted. Its entries either went with it or were detached,
 * and either way every task tally the client holds is now a guess — so the
 * task views' own root fields go too.
 */
export const onCollectionDeleted = (collectionId, deletedTasks) => (cache, { data }) => {
  if (data?.deleteCollection && data.deleteCollection.success === false) return;
  const ref = cache.identify({ __typename: 'Collection', id: String(collectionId) });
  cache.modify({
    fields: {
      collections(existing = [], { readField }) {
        return existing.filter((c) => String(readField('id', c)) !== String(collectionId));
      },
    },
  });
  if (ref) cache.evict({ id: ref });
  // Detaching rewrites the tasks' collectionId server-side; cascading removes
  // them outright. Neither is something the client can mirror field by field.
  if (deletedTasks) cache.evict({ id: 'ROOT_QUERY', fieldName: 'taskTags' });
  cache.gc();
};

/* ─── Habits ─────────────────────────────────────────────────────────────── */

/** Clause 2: a new habit joins the `habits` root list, whatever its args. */
export const onHabitCreated = (cache, { data }) => {
  const habit = data?.createHabit;
  if (!habit) return;
  cache.modify({
    fields: {
      habits(existing = [], { toReference, readField }) {
        const ref = toReference(habit);
        if (!ref) return existing;
        if (existing.some((h) => readField('id', h) === habit.id)) return existing;
        return [...existing, ref];
      },
    },
  });
};

/**
 * A habit was deleted — and its whole log history with it, which is why the
 * `habitLogs` windows are evicted rather than filtered: the client does not
 * hold every window, and a filter would leave the ones it does not.
 */
export const onHabitDeleted = (habitId) => (cache, { data }) => {
  if (data?.deleteHabit && data.deleteHabit.success === false) return;
  cache.modify({
    fields: {
      habits(existing = [], { readField }) {
        return existing.filter((h) => String(readField('id', h)) !== String(habitId));
      },
    },
  });
  const ref = cache.identify({ __typename: 'Habit', id: String(habitId) });
  if (ref) cache.evict({ id: ref });
  cache.evict({ id: 'ROOT_QUERY', fieldName: 'habitLogs' });
  cache.gc();
};

/**
 * A habit day was toggled. `habitLogs` is keyed by its date window, so the
 * modify runs across every cached window and each one decides for itself
 * whether the toggled date falls inside it — adding or removing accordingly.
 * Without this, walking away from the grid and back showed yesterday's answer
 * until the network caught up.
 */
export const onHabitLogToggled = (habitId, dateKey) => (cache, { data }) => {
  const result = data?.toggleHabitLog;
  if (!result) return;

  cache.modify({
    fields: {
      habitLogs(existing = [], { toReference, readField, storeFieldName }) {
        // storeFieldName carries the window this cached list was read for,
        // e.g. habitLogs({"startDate":"2026-09-01","endDate":"2026-09-30"}).
        const match = /"startDate":"([^"]+)".*"endDate":"([^"]+)"/.exec(storeFieldName);
        if (match && (dateKey < match[1] || dateKey > match[2])) return existing;

        const isThisDay = (log) =>
          String(readField('habitId', log)) === String(habitId) &&
          String(readField('date', log) ?? '').slice(0, 10) === dateKey;

        if (!result.done) return existing.filter((log) => !isThisDay(log));
        if (existing.some(isThisDay)) return existing;
        const ref = result.log ? toReference(result.log) : null;
        return ref ? [...existing, ref] : existing;
      },
    },
  });
};

/* ─── Journal ────────────────────────────────────────────────────────────── */

/**
 * A journal entry was created — currently only reachable via
 * `createJournalFromTemplate` (the "apply a template" path that produces a
 * journal entry rather than tasks; see the note on `TemplateContext.jsx`).
 * Clause 2: `journalEntries` is a root list filtered by `$type`/`$tags`, so
 * each cached variant decides for itself whether the new entry belongs — the
 * same shape as `habitLogs` deciding per date window in `onHabitLogToggled`.
 * There is no derived count on a journal entry for clause 3 to evict.
 */
export const onJournalEntryCreated = (cache, { data }) => {
  const entry = data?.createJournalFromTemplate ?? data?.createJournalEntry;
  if (!entry) return;
  cache.modify({
    fields: {
      journalEntries(existing = [], { toReference, readField, storeFieldName }) {
        // storeFieldName carries the args this cached list was read with,
        // e.g. journalEntries({"tags":["daily"],"type":"daily"}) — the same
        // trick `onHabitLogToggled` uses for its date-window args.
        const typeMatch = /"type":"([^"]*)"/.exec(storeFieldName);
        if (typeMatch && typeMatch[1] !== entry.type) return existing;

        const tagsMatch = /"tags":\[([^\]]*)\]/.exec(storeFieldName);
        if (tagsMatch && tagsMatch[1]) {
          const wanted = tagsMatch[1].split(',').map((s) => s.replace(/^"|"$/g, ''));
          if (!wanted.some((tag) => (entry.tags || []).includes(tag))) return existing;
        }

        const ref = toReference(entry);
        if (!ref) return existing;
        if (existing.some((e) => readField('id', e) === entry.id)) return existing;
        return [...existing, ref];
      },
    },
  });
};
