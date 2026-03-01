import { useState, useRef, useEffect } from 'react';
import { Box, InputBase, Typography, Modal, Backdrop, useTheme } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus } from 'lucide-react';
import { colors } from '../../theme/colors';
import TaskInputHelpButton from '../tasks/TaskInputHelpButton';
import parseTaskInput from '../../utils/parseTaskInput';

const CommandPalette = ({ open, onClose, onCreateTask }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

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

    onCreateTask?.(parsed);

    setValue('');
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAfterTransition
      slots={{ backdrop: Backdrop }}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: 'rgba(26, 26, 46, 0.4)',
            backdropFilter: 'blur(4px)',
          },
        },
      }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              top: '20%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '90%',
              maxWidth: 560,
              zIndex: 1300,
            }}
          >
            <Box
              component="form"
              onSubmit={handleSubmit}
              sx={{
                backgroundColor: theme.palette.background.paper,
                borderRadius: '16px',
                boxShadow: isDark ? `0 24px 48px rgba(0,0,0,0.5)` : `0 24px 48px ${colors.ink[900]}30`,
                border: `1px solid ${theme.palette.divider}`,
                overflow: 'hidden',
              }}
            >
              {/* Input area */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2.5,
                  py: 2,
                }}
              >
                <Plus size={20} color={colors.primary[500]} style={{ flexShrink: 0 }} />
                <InputBase
                  inputRef={inputRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="What needs to get done?"
                  fullWidth
                  autoFocus
                  sx={{
                    fontSize: '1rem',
                    fontWeight: 500,
                    color: theme.palette.text.primary,
                    '& input::placeholder': {
                      color: theme.palette.text.disabled,
                      opacity: 1,
                    },
                  }}
                />
              </Box>

              {/* Hints */}
              <Box
                sx={{
                  px: 2.5,
                  py: 1.5,
                  borderTop: `1px solid ${colors.ink[100]}`,
                  backgroundColor: colors.ink[50],
                  display: 'flex',
                  gap: 2,
                  flexWrap: 'wrap',
                }}
              >
                <HintChip label="*task" />
                <HintChip label="@event" />
                <HintChip label="#tag" />
                <HintChip label="!high" />
                <HintChip label="/tomorrow" />
                <HintChip label="^note" />
                <Box sx={{ flex: 1 }} />
                <TaskInputHelpButton compact />
                <Typography
                  sx={{
                    fontSize: '0.6875rem',
                    color: colors.ink[400],
                    alignSelf: 'center',
                  }}
                >
                  Enter to create · Esc to close
                </Typography>
              </Box>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
};

const HintChip = ({ label }) => (
  <Typography
    sx={{
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: '0.6875rem',
      color: colors.ink[400],
      backgroundColor: colors.parchment.paper,
      border: `1px solid ${colors.ink[200]}`,
      borderRadius: '4px',
      px: 0.75,
      py: 0.125,
      lineHeight: 1.6,
    }}
  >
    {label}
  </Typography>
);

export default CommandPalette;
