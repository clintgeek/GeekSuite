import { Box } from '@mui/material';
import SectionHeader from '../shared/SectionHeader';
import TaskRow from '../tasks/TaskRow';

/**
 * UpcomingSection — tasks due within the next 7 days, shown below Today.
 * Read-only ordering (no drag-and-drop); sorted by due date by the parent.
 */
const UpcomingSection = ({
  tasks,
  onStatusToggle,
  onEdit,
  onDelete,
  onSaveAsNote,
  onCancel,
  focusedTaskId,
}) => {
  if (!tasks || tasks.length === 0) return null;

  return (
    <Box>
      <SectionHeader title="Upcoming" count={tasks.length} size="display" />
      <Box
        sx={{
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        {tasks.map((task) => (
          <TaskRow
            key={task.id || task._id}
            task={task}
            onStatusToggle={onStatusToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            onSaveAsNote={onSaveAsNote}
            onCancel={onCancel}
            focused={focusedTaskId === (task.id || task._id)}
          />
        ))}
      </Box>
    </Box>
  );
};

export default UpcomingSection;
