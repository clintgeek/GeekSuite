/**
 * Where a task can go, without dragging (W4): the seven days on screen and
 * "Next week". Also the only way to move a task from the keyboard.
 */
import React from 'react';
import { Box, Divider, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import { shortDay, shortMonthDay, weekdayName } from '../../lib/days.js';
import { dueDayKey } from '../../lib/tasks.js';
import { nextWeekTarget } from '../../lib/week.js';

export default function MoveMenu({ task, anchor, keys, today, now, onClose, onPick }) {
  const open = Boolean(task && anchor);
  const current = task ? dueDayKey(task) : '';
  const nextWeek = task ? nextWeekTarget(task, keys) : '';
  const pick = (key) => {
    onClose();
    onPick(task, key);
  };

  return (
    <Menu
      anchorEl={anchor}
      open={open}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      MenuListProps={{ 'aria-label': task ? `Move “${task.content}” to` : 'Move to', 'data-testid': 'week-move-menu', dense: false }}
      slotProps={{ paper: { sx: { minWidth: 232 } } }}
    >
      {keys.map((key) => (
        <MenuItem
          key={key}
          onClick={() => pick(key)}
          disabled={key === current}
          selected={key === current}
          data-testid="week-move-to"
          data-day={key}
          sx={{ minHeight: 44, gap: 2 }}
        >
          <ListItemText primary={weekdayName(key)} />
          <Typography
            component="span"
            sx={{ fontSize: '0.8125rem', fontWeight: key === today ? 700 : 400, color: key === today ? 'secondary.main' : 'text.secondary' }}
          >
            {key === today ? 'Today' : shortMonthDay(key)}
          </Typography>
        </MenuItem>
      ))}
      <Divider component="li" />
      <MenuItem onClick={() => pick(nextWeek)} data-testid="week-move-next-week" data-day={nextWeek} sx={{ minHeight: 44, gap: 2 }}>
        <ListItemText primary="Next week" />
        <Box component="span" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
          {nextWeek ? shortDay(nextWeek, now) : ''}
        </Box>
      </MenuItem>
    </Menu>
  );
}
