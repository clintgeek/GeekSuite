import { Box } from '@mui/material';
import SectionHeader from '../shared/SectionHeader';
import TaskRow from '../tasks/TaskRow';
import EmptyState from '../shared/EmptyState';

const TodaySection = ({ tasks, onStatusToggle, onEdit, onDelete, onSaveAsNote, focusedTaskId }) => {
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
      <Box
        sx={{
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        {tasks.map((task) => (
          <TaskRow
            key={(task.id || task._id)}
            task={task}
            onStatusToggle={onStatusToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            onSaveAsNote={onSaveAsNote}
            focused={focusedTaskId === (task.id || task._id)}
          />
        ))}
      </Box>
    </Box>
  );
};

export default TodaySection;
