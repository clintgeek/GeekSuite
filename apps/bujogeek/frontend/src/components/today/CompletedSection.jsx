import { useState } from 'react';
import { Box, IconButton } from '@mui/material';
import { ChevronDown, ChevronRight } from 'lucide-react';
import SectionHeader from '../shared/SectionHeader';
import TaskRow from '../tasks/TaskRow';

const CompletedSection = ({ tasks, onStatusToggle, onEdit, onDelete, onSaveAsNote, onCancel, subtaskProps }) => {
  const [expanded, setExpanded] = useState(false);

  if (!tasks || tasks.length === 0) return null;

  return (
    <Box>
      <SectionHeader
        title="Completed"
        count={tasks.length}
        action={
          <IconButton
            size="small"
            onClick={() => setExpanded(!expanded)}
            sx={{ color: 'text.secondary' }}
            aria-label={expanded ? 'Collapse completed tasks' : 'Expand completed tasks'}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </IconButton>
        }
      />

      {expanded && (
        <Box
          sx={{
            borderRadius: '8px',
            overflow: 'hidden',
            opacity: 0.7,
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
              onCancel={onCancel}
              {...(subtaskProps || {})}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default CompletedSection;
