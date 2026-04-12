import { useCallback } from 'react';
import { Box } from '@mui/material';
import { Reorder } from 'framer-motion';
import SectionHeader from '../shared/SectionHeader';
import TaskRow from '../tasks/TaskRow';
import EmptyState from '../shared/EmptyState';

/**
 * TodaySection — the primary task list with drag-and-drop reorder.
 *
 * Uses framer-motion's Reorder components (already installed — no extra
 * dependency needed). On reorder, calls onReorder(newOrder) which the
 * parent uses to persist via saveDailyOrder.
 */
const TodaySection = ({
  tasks,
  onStatusToggle,
  onEdit,
  onDelete,
  onSaveAsNote,
  focusedTaskId,
  onReorder,
}) => {
  const handleReorder = useCallback(
    (newOrder) => {
      onReorder?.(newOrder);
    },
    [onReorder]
  );

  if (!tasks || tasks.length === 0) {
    return (
      <EmptyState
        title="A clean page"
        description="Use the field above to begin planning your day."
      />
    );
  }

  return (
    <Box>
      <SectionHeader title="Today" count={tasks.length} size="display" />
      <Reorder.Group
        axis="y"
        values={tasks}
        onReorder={handleReorder}
        as="div"
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        {tasks.map((task) => (
          <Reorder.Item
            key={task.id || task._id}
            value={task}
            as="div"
            style={{ cursor: 'grab' }}
            whileDrag={{
              scale: 1.02,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              cursor: 'grabbing',
              zIndex: 10,
            }}
            transition={{ duration: 0.2 }}
          >
            <TaskRow
              task={task}
              onStatusToggle={onStatusToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              onSaveAsNote={onSaveAsNote}
              focused={focusedTaskId === (task.id || task._id)}
            />
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </Box>
  );
};

export default TodaySection;
