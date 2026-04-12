import { useState, useRef, useEffect } from 'react';
import { Box, InputBase, Typography, useTheme } from '@mui/material';
import { useMutation } from '@apollo/client';
import { colors } from '../../theme/colors';
import { useToast } from '../shared/Toast';
import TaskInputHelpButton from '../tasks/TaskInputHelpButton';
import parseTaskInput from '../../utils/parseTaskInput';
import { CREATE_NOTE } from '../../graphql/notegeekMutations';

const InlineQuickAdd = ({ onAdd, autoFocus = false }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const inputRef = useRef(null);
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const toast = useToast();
  const [createNote] = useMutation(CREATE_NOTE);

  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [autoFocus]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    const parsed = parseTaskInput(trimmed);
    if (!parsed.content) return;

    // Default dueDate to today 9am local when the user doesn't specify one
    if (!parsed.dueDate) {
      const today = new Date();
      today.setHours(9, 0, 0, 0);
      parsed.dueDate = today;
    }

    // If $^ was used, also save a note to NoteGeek
    if (parsed.noteGeekNote) {
      createNote({
        variables: {
          title: parsed.content,
          content: parsed.noteGeekNote,
          type: 'text',
          tags: parsed.tags || [],
        },
      })
        .then(() => toast.success('Note saved to NoteGeek'))
        .catch(() => toast.error('Failed to save note to NoteGeek'));
    }

    // Strip noteGeekNote before passing to task creation
    const { noteGeekNote, ...taskData } = parsed;
    onAdd?.(taskData);

    setValue('');
    // Keep focus after submit — the user is planning, let them keep writing
    inputRef.current?.focus();
  };

  return (
    <Box sx={{ pt: { xs: 2.5, sm: 3 }, pb: { xs: 1, sm: 1.5 } }}>
      <Box
        component="form"
        onSubmit={handleSubmit}
        onClick={() => inputRef.current?.focus()}
        sx={{
          px: { xs: 1.5, sm: 2 },
          py: { xs: 2, sm: 2.5 },
          borderRadius: '12px',
          backgroundColor: focused
            ? theme.palette.background.paper
            : (isDark ? 'rgba(255,255,255,0.02)' : colors.parchment.warm),
          border: '1.5px solid transparent',
          borderColor: focused
            ? colors.primary[300]
            : 'transparent',
          boxShadow: focused
            ? `0 0 0 3px ${isDark ? 'rgba(96,152,204,0.12)' : colors.primary[50]}`
            : 'none',
          transition: 'all 0.2s ease',
          cursor: 'text',
        }}
      >
        {/* Prompt label — visible only when empty and unfocused */}
        {!focused && !value && (
          <Box sx={{ mb: 0.75 }}>
            <Typography
              sx={{
                fontFamily: '"Fraunces", serif',
                fontSize: { xs: '0.75rem', sm: '0.8125rem' },
                fontWeight: 400,
                fontStyle: 'italic',
                color: isDark ? 'rgba(255,255,255,0.25)' : colors.ink[300],
                letterSpacing: '0.01em',
                lineHeight: 1,
                userSelect: 'none',
              }}
            >
              Plan your day
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <InputBase
          inputRef={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={focused ? 'Write a task\u2026  #tag  !high  /tomorrow  (daily)  ^note' : 'What needs to happen today?'}
          fullWidth
          sx={{
            fontSize: { xs: '1rem', sm: '1.0625rem' },
            fontWeight: 450,
            color: theme.palette.text.primary,
            lineHeight: 1.6,
            '& input': {
              py: 0,
            },
            '& input::placeholder': {
              color: focused
                ? (isDark ? 'rgba(255,255,255,0.2)' : colors.ink[300])
                : (isDark ? 'rgba(255,255,255,0.3)' : colors.ink[400]),
              opacity: 1,
              fontWeight: 400,
            },
          }}
          inputProps={{
            'aria-label': 'Add a task for today',
            'data-quickadd': true,
          }}
        />
          <TaskInputHelpButton compact />
        </Box>

        {/* Bottom rule line — like paper */}
        <Box
          sx={{
            mt: 1.5,
            height: '1px',
            background: focused
              ? `linear-gradient(90deg, ${colors.primary[300]}, transparent 80%)`
              : (isDark
                ? 'linear-gradient(90deg, rgba(255,255,255,0.06), transparent 70%)'
                : `linear-gradient(90deg, ${colors.ink[200]}, transparent 70%)`),
            transition: 'all 0.2s ease',
          }}
        />
      </Box>
    </Box>
  );
};

export default InlineQuickAdd;
