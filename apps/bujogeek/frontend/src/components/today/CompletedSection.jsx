import { useState } from 'react';
import { Box, IconButton } from '@mui/material';
import { ChevronDown, ChevronRight } from 'lucide-react';
import SectionHeader from '../shared/SectionHeader';
import TaskRow from '../tasks/TaskRow';
import { colors } from '../../theme/colors';

const CompletedSection = ({ tasks, onStatusToggle, onEdit, onDelete }) => {
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
            sx={{ color: colors.ink[400] }}
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
              key={task._id}
              task={task}
              onStatusToggle={onStatusToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default CompletedSection;
