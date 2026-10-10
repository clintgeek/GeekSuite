/**
 * usePenRows — what every list view shares: rows that open their editor in
 * place, one pick-a-date sheet, and the desktop keys with focus following the
 * task id (hooks/useRowKeys.js).
 *
 * @param {object[]} order  the rows in on-screen order (keyboard j/k order)
 */
import { useCallback, useState } from 'react';
import PenRow from './PenRow';
import InlineEditor from './InlineEditor';
import DatePickSheet from './DatePickSheet';
import useRowKeys from '../../hooks/useRowKeys';
import { usePen } from '../../context/PenContext';
import { isDone, taskId } from '../../utils/penViews';

export default function usePenRows(order) {
  const pen = usePen();
  const [expandedId, setExpandedId] = useState(null);
  const [picking, setPicking] = useState(null);

  const onDone = useCallback((task) => { pen.toggleDone(task); }, [pen]);
  const onTomorrow = useCallback((task) => { if (!isDone(task)) pen.moveToTomorrow(task); }, [pen]);
  const onPickDate = useCallback((task) => { if (!isDone(task)) setPicking(task); }, []);
  const onToggleExpand = useCallback((task) => {
    const id = taskId(task);
    setExpandedId((cur) => (cur === id ? null : id));
  }, []);

  const keys = useRowKeys({
    tasks: order,
    enabled: !picking,
    onDone,
    onTomorrow,
    onPickDate,
    onEdit: onToggleExpand,
  });

  const renderRow = (task, { context = 'list', crossed = false } = {}) => {
    const id = taskId(task);
    const expanded = expandedId === id;
    return (
      <PenRow
        key={id}
        task={task}
        now={pen.now}
        context={context}
        crossed={crossed}
        focused={keys.focusedTaskId === id}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        onDone={onDone}
        onTomorrow={onTomorrow}
        onPickDate={onPickDate}
        editor={expanded ? (
          <InlineEditor
            task={task}
            onCancel={() => setExpandedId(null)}
            onSave={async (fields, scope) => Boolean(await pen.save(task, fields, scope))}
            onDelete={(t) => { setExpandedId(null); pen.remove(t); }}
          />
        ) : null}
      />
    );
  };

  const sheet = (
    <DatePickSheet
      task={picking}
      now={pen.now}
      onClose={() => setPicking(null)}
      onPick={(task, key, label) => pen.moveTo(task, key, { label })}
    />
  );

  return { renderRow, sheet, focusedTaskId: keys.focusedTaskId, expandedId };
}
