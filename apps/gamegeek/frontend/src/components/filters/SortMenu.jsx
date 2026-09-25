/**
 * Sort: one pill ("Title · A → Z") that opens a menu of sorts and, under a
 * rule, the direction in words that fit the sort ("Shortest first", not
 * "ascending"). Shuffle has no direction; it offers "Shuffle again" instead,
 * which mints a new seed.
 */
import React, { useState } from 'react';
import { Box, Button, Divider, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import { Check as CheckIcon, Shuffle as ShuffleIcon, SwapVert as SortIcon } from '@mui/icons-material';
import { DIR_LABELS, SORT_LABELS, SORT_ORDER, SORT_SHORT } from '../../utils/libraryFilter';
import { pillSx } from './filterUi';


export default function SortMenu({ sort, dir, onSort, onReshuffle, compact = false }) {
  const [anchor, setAnchor] = useState(null);
  const close = () => setAnchor(null);
  const random = sort === 'random';
  const dirText = random ? '' : DIR_LABELS[sort]?.[dir] ?? '';
  const name = SORT_LABELS[sort] || sort;

  return (
    <>
      <Button
        variant="outlined"
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : 'false'}
        aria-label={`Sort: ${name}${dirText ? `, ${dirText}` : ''}`}
        startIcon={random ? <ShuffleIcon sx={{ fontSize: 18 }} /> : <SortIcon sx={{ fontSize: 18 }} />}
        sx={pillSx}
      >
        {compact ? SORT_SHORT[sort] || name : name}
        {!compact && dirText ? (
          <Box component="span" sx={{ ml: 0.75, color: 'text.secondary', fontWeight: 400 }}>
            {dirText}
          </Box>
        ) : null}
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 220, mt: 0.5, border: 1, borderColor: 'divider' } } }}
        MenuListProps={{ dense: false, 'aria-label': 'Sort by' }}
      >
        {SORT_ORDER.map((id) => (
          <MenuItem
            key={id}
            role="menuitemradio"
            aria-checked={sort === id ? 'true' : 'false'}
            selected={sort === id}
            onClick={() => {
              onSort(id);
              close();
            }}
            sx={{ minHeight: 44, fontSize: '0.875rem' }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>{sort === id ? <CheckIcon sx={{ fontSize: 18 }} /> : null}</ListItemIcon>
            <ListItemText primary={SORT_LABELS[id]} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: sort === id ? 600 : 400 }} />
          </MenuItem>
        ))}
        <Divider />
        {random ? (
          <MenuItem
            onClick={() => {
              onReshuffle();
              close();
            }}
            sx={{ minHeight: 44 }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              <ShuffleIcon sx={{ fontSize: 18 }} />
            </ListItemIcon>
            <ListItemText primary="Shuffle again" primaryTypographyProps={{ fontSize: '0.875rem' }} />
          </MenuItem>
        ) : (
          ['asc', 'desc'].map((d) => (
            <MenuItem
              key={d}
              role="menuitemradio"
              aria-checked={dir === d ? 'true' : 'false'}
              onClick={() => {
                onSort(sort, d);
                close();
              }}
              sx={{ minHeight: 44 }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>{dir === d ? <CheckIcon sx={{ fontSize: 18 }} /> : null}</ListItemIcon>
              <ListItemText primary={DIR_LABELS[sort]?.[d]} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: dir === d ? 600 : 400 }} />
            </MenuItem>
          ))
        )}
      </Menu>
    </>
  );
}
