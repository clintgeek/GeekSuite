import { useState, useRef, useEffect } from 'react';
import { Box, InputBase, Typography, useTheme } from '@mui/material';
import { colors } from '../../theme/colors';

const InlineQuickAdd = ({ onAdd, autoFocus = false }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const inputRef = useRef(null);
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [autoFocus]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    // Parse tags
    const tags = [];
    const tagMatches = trimmed.match(/#(\w+)/g);
    if (tagMatches) {
      tagMatches.forEach((t) => tags.push(t.replace('#', '')));
    }

    // Parse priority
    let priority = null;
    if (/!high/i.test(trimmed)) priority = 1;
    else if (/!medium/i.test(trimmed)) priority = 2;
    else if (/!low/i.test(trimmed)) priority = 3;

    // Clean content
    const content = trimmed
      .replace(/#\w+/g, '')
      .replace(/!(high|medium|low)/i, '')
      .trim();

    if (!content) return;

    onAdd?.({
      content,
      tags: tags.length > 0 ? tags : undefined,
      priority: priority || undefined,
      dueDate: new Date().toISOString(),
    });

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
          <Typography
            sx={{
              fontFamily: '"Fraunces", serif',
              fontSize: { xs: '0.75rem', sm: '0.8125rem' },
              fontWeight: 400,
              fontStyle: 'italic',
              color: isDark ? 'rgba(255,255,255,0.25)' : colors.ink[300],
              mb: 0.75,
              letterSpacing: '0.01em',
              lineHeight: 1,
              userSelect: 'none',
            }}
          >
            Start your day
          </Typography>
        )}

        <InputBase
          inputRef={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={focused ? 'Write a task\u2026  #tag  !high  !low' : 'What needs to happen today?'}
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
          }}
        />

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
