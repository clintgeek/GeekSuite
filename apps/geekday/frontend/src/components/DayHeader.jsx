/**
 * The top of the diary page: the date, set large, and the way to other days
 * (spec req 12). The ribbon marks today.
 */
import React, { useState } from 'react';
import { Box, Button, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ChecklistRounded from '@mui/icons-material/ChecklistRounded';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';
import StickyNote2Outlined from '@mui/icons-material/StickyNote2Outlined';
import { monthDay, relativeName, weekdayName } from '../lib/days.js';
import { DISPLAY_FONT } from '../theme/theme.js';

const TARGET = 48;

const navButtonSx = (theme) => ({
  width: TARGET,
  height: TARGET,
  color: 'text.primary',
  border: `1px solid ${theme.palette.day.border}`,
  borderRadius: 2.5,
});

export default function DayHeader({ dayKey, today, onPrev, onNext, onToday, onWeek, noteId, mode, onToggleMode, onSignOut, now }) {
  const [anchor, setAnchor] = useState(null);
  const isToday = dayKey === today;
  const relative = relativeName(dayKey, now);
  const year = dayKey.slice(0, 4);
  const showYear = year !== today.slice(0, 4);
  const closeMenu = () => setAnchor(null);

  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 1.5,
        px: { xs: 1.5, sm: 2.5 },
        pt: 'max(16px, env(safe-area-inset-top))',
        pb: 1.5,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 22 }}>
          {relative ? (
            <Typography
              data-testid="day-relative"
              sx={{
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: isToday ? 'secondary.main' : 'text.secondary',
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
              }}
            >
              {isToday ? <Box aria-hidden sx={{ width: 18, height: 3, borderRadius: 2, bgcolor: 'secondary.main' }} /> : null}
              {relative}
            </Typography>
          ) : null}
        </Box>
        <Typography
          component="h1"
          data-testid="day-title"
          data-day={dayKey}
          sx={{
            fontFamily: DISPLAY_FONT,
            fontWeight: 600,
            // 40px at the 800px tablet, 44px from 880px up: with the Week button beside Today, the longest
            // date this year ("Wednesday September 30", 528px at 44px) would otherwise be cut off.
            fontSize: { xs: '2rem', sm: 'clamp(2.25rem, 5vw, 2.75rem)' },
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {weekdayName(dayKey)}
          <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400, ml: '0.35em' }}>
            {monthDay(dayKey)}
            {showYear ? `, ${year}` : ''}
          </Box>
        </Typography>
      </Box>

      <Box component="nav" aria-label="Days" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: 'none' }}>
        {!isToday ? (
          <Button
            onClick={onToday}
            data-testid="day-today"
            variant="outlined"
            sx={(theme) => ({ minHeight: TARGET, borderRadius: 2.5, px: 1.75, color: 'secondary.main', borderColor: theme.palette.secondary.main })}
          >
            Today
          </Button>
        ) : null}
        {onWeek ? (
          // To the week spread (spec §6, W8).
          <Button
            onClick={onWeek}
            data-testid="day-week"
            variant="outlined"
            sx={(theme) => ({ minHeight: TARGET, minWidth: 0, borderRadius: 2.5, px: 1.75, color: 'text.primary', borderColor: theme.palette.day.border })}
          >
            Week
          </Button>
        ) : null}
        <Tooltip title="Previous day">
          <IconButton onClick={onPrev} aria-label="Previous day" data-testid="day-prev" sx={navButtonSx}>
            <ChevronLeftRounded />
          </IconButton>
        </Tooltip>
        <Tooltip title="Next day">
          <IconButton onClick={onNext} aria-label="Next day" data-testid="day-next" sx={navButtonSx}>
            <ChevronRightRounded />
          </IconButton>
        </Tooltip>
        <IconButton
          onClick={(event) => setAnchor(event.currentTarget)}
          aria-label="More"
          aria-haspopup="menu"
          aria-expanded={Boolean(anchor)}
          data-testid="day-menu"
          sx={{ width: TARGET, height: TARGET, color: 'text.primary' }}
        >
          <MoreHorizRounded />
        </IconButton>
      </Box>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={closeMenu} MenuListProps={{ 'aria-label': 'More' }}>
        <MenuItem
          component="a"
          href={noteId ? `https://notegeek.clintgeek.com/notes/${noteId}` : 'https://notegeek.clintgeek.com/'}
          onClick={closeMenu}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon>
            <StickyNote2Outlined fontSize="small" />
          </ListItemIcon>
          <ListItemText>{noteId ? 'Open this page in NoteGeek' : 'Open NoteGeek'}</ListItemText>
        </MenuItem>
        <MenuItem component="a" href="https://todogeek.clintgeek.com/" onClick={closeMenu} sx={{ minHeight: 48 }}>
          <ListItemIcon>
            <ChecklistRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>Open TodoGeek</ListItemText>
        </MenuItem>
        {onToggleMode ? (
          <MenuItem
            onClick={() => {
              closeMenu();
              onToggleMode();
            }}
            sx={{ minHeight: 48 }}
          >
            <ListItemIcon>{mode === 'dark' ? <LightModeOutlined fontSize="small" /> : <DarkModeOutlined fontSize="small" />}</ListItemIcon>
            <ListItemText>{mode === 'dark' ? 'Light paper' : 'Dark paper'}</ListItemText>
          </MenuItem>
        ) : null}
        <MenuItem
          onClick={() => {
            closeMenu();
            onSignOut();
          }}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon>
            <LogoutRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText>Sign out</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}
