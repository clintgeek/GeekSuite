import React, { useState } from 'react';
import { Box, FormControl, InputLabel, Select, MenuItem, Checkbox, ListItemText, useTheme, Drawer, IconButton, Typography, TextField } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import CloseIcon from '@mui/icons-material/Close';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useTaskContext } from '../../context/TaskContext';

export const FiltersButton = ({ onClick }) => (
  <IconButton
    onClick={onClick}
    sx={{ ml: 0.5, p: 1, display: { xs: 'inline-flex', sm: 'none' } }}
    aria-label="Open filters"
    size="medium"
  >
    <FilterListIcon fontSize="medium" />
  </IconButton>
);

const TaskFilters = ({ openDrawer, setDrawerOpen }) => {
  const { filters, updateFilters, tasks } = useTaskContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [internalDrawerOpen, setInternalDrawerOpen] = useState(false);
  const drawerOpen = typeof openDrawer === 'boolean' ? openDrawer : internalDrawerOpen;
  const handleSetDrawerOpen = setDrawerOpen || setInternalDrawerOpen;

  const handleFilterChange = (field, value) => {
    updateFilters({ ...filters, [field]: value });
  };

  // Get all unique tags from tasks
  const availableTags = React.useMemo(() => {
    const tagSet = new Set();
    tasks.forEach(task => {
      if (task.tags) {
        task.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [tasks]);

  // The filter controls (shared between inline and drawer)
  const filterControls = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 2,
        width: '100%',
        alignItems: { xs: 'stretch', sm: 'center' },
        p: 2
      }}
    >
      <TextField
        size="small"
        label="Search"
        value={filters.search || ''}
        onChange={(e) => handleFilterChange('search', e.target.value)}
        placeholder="Search tasks..."
        sx={{ minWidth: 240 }}
      />

      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel>Status</InputLabel>
        <Select
          value={filters.status || ''}
          label="Status"
          onChange={(e) => handleFilterChange('status', e.target.value)}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel>Priority</InputLabel>
        <Select
          value={filters.priority || ''}
          label="Priority"
          onChange={(e) => handleFilterChange('priority', e.target.value)}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="1">High</MenuItem>
          <MenuItem value="2">Medium</MenuItem>
          <MenuItem value="3">Low</MenuItem>
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel>Tags</InputLabel>
        <Select
          multiple
          value={filters.tags || []}
          label="Tags"
          onChange={(e) => handleFilterChange('tags', e.target.value)}
          renderValue={(selected) => selected.join(', ')}
          MenuProps={{
            PaperProps: {
              style: {
                maxHeight: 300
              }
            }
          }}
        >
          {availableTags.map((tag) => (
            <MenuItem key={tag} value={tag}>
              <Checkbox checked={(filters.tags || []).indexOf(tag) > -1} />
              <ListItemText primary={tag} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel>Type</InputLabel>
        <Select
          value={filters.type || ''}
          label="Type"
          onChange={(e) => handleFilterChange('type', e.target.value)}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="*">Task (*)</MenuItem>
          <MenuItem value="@">Event (@)</MenuItem>
          <MenuItem value="-">Note (-)</MenuItem>
          <MenuItem value="?">Question (?)</MenuItem>
        </Select>
      </FormControl>
    </Box>
  );

  if (isMobile) {
    return (
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => handleSetDrawerOpen(false)}
        PaperProps={{ sx: { width: '80vw', maxWidth: 340 } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, pb: 0 }}>
          <Typography variant="h6">Filters</Typography>
          <IconButton onClick={() => handleSetDrawerOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Box>
        {filterControls}
      </Drawer>
    );
  }

  // Desktop: always show filters inline
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        gap: 2,
        width: '100%',
        alignItems: 'center',
      }}
    >
      {filterControls}
    </Box>
  );
};

export default TaskFilters;