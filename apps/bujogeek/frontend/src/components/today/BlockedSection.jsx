import { useState } from 'react';
import { Box, IconButton } from '@mui/material';
import { ChevronDown, ChevronRight } from 'lucide-react';
import SectionHeader from '../shared/SectionHeader';
import TaskRow from '../tasks/TaskRow';
import EmptyState from '../shared/EmptyState';
import { colors } from '../../theme/colors';

/**
 * BlockedSection — the parked shelf, last on the page.
 *
 * Unlike Upcoming and Completed, this section renders even when it is empty:
 * "nothing is blocked" is information worth seeing every day, and a section
 * that vanishes teaches nobody the shelf exists. Blocked tasks are excluded
 * from the log server-side, so this is the only place on Today they appear.
 *
 * The row itself carries the blocked language (chip, reason, parked-since) —
 * see TaskRow — so this component is only the shelf it sits on.
 */
const BlockedSection = ({
  tasks,
  onStatusToggle,
  onEdit,
  onDelete,
  onSaveAsNote,
  onCancel,
  onUnblock,
  focusedTaskId,
}) => {
  const rows = Array.isArray(tasks) ? tasks : [];
  const [expanded, setExpanded] = useState(true);

  return (
    <Box>
      <SectionHeader
        title="Blocked"
        count={rows.length}
        size="display"
        caption={
          rows.length === 0
            ? 'nothing is waiting on anyone'
            : `${rows.length} ${rows.length === 1 ? 'task is' : 'tasks are'} parked`
        }
        action={
          rows.length > 0 ? (
            <IconButton
              size="small"
              onClick={() => setExpanded(!expanded)}
              sx={{ color: colors.ink[400] }}
              aria-label={expanded ? 'Collapse blocked tasks' : 'Expand blocked tasks'}
            >
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </IconButton>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          compact
          title="Nothing is blocked"
          description="When a task is waiting on someone else, park it here — it keeps its due date and stays out of the log until you unblock it."
        />
      ) : (
        expanded && (
          <Box sx={{ borderRadius: '8px', overflow: 'hidden' }}>
            {rows.map((task) => (
              <TaskRow
                key={task.id || task._id}
                task={task}
                onStatusToggle={onStatusToggle}
                onEdit={onEdit}
                onDelete={onDelete}
                onSaveAsNote={onSaveAsNote}
                onCancel={onCancel}
                onUnblock={onUnblock}
                focused={focusedTaskId === (task.id || task._id)}
              />
            ))}
          </Box>
        )
      )}
    </Box>
  );
};

export default BlockedSection;
