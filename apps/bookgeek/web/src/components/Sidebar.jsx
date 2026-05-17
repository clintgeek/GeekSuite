import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  alpha,
  useTheme
} from '@mui/material';
import {
  LibraryBooks as LibraryIcon,
  FilterList as FilterIcon,
  DeleteOutline as DeleteIcon,
} from '@mui/icons-material';
import { geekLayout } from '@geeksuite/ui';

const Sidebar = ({
  shelves,
  shelfFilter,
  setShelfFilter,
  shelfSummary,
  setActiveView,
  ownedFilter,
  setOwnedFilter,
  searchQuery,
  setSearchQuery,
  authorFilter,
  setAuthorFilter,
  tagFilter,
  setTagFilter,
  savedFilters,
  savedFiltersLoading,
  savedFiltersError,
  applySavedFilter,
  handleDeleteSavedFilter,
  deleteFilterLoadingId
}) => {
  const theme = useTheme();

  const hasAnyFilter = searchQuery.trim() ||
    authorFilter.trim() ||
    tagFilter.trim() ||
    shelfFilter !== "all" ||
    ownedFilter !== "all";

  return (
    <Box
      sx={{
        width: geekLayout.sidebarWidth,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderRight: `1px solid ${theme.palette.divider}`,
        flexShrink: 0,
        overflowY: 'auto',
        p: 2
      }}
    >
      <Typography variant="overline" sx={{ mb: 1, color: 'text.secondary', fontWeight: 700 }}>
        Shelves
      </Typography>
      <List dense disablePadding sx={{ mb: 3 }}>
        {shelves.map((shelf) => {
          const isActive = shelf.id === shelfFilter;
          const count = (() => {
            if (!shelfSummary) return "--";
            if (shelf.id === "all") return shelfSummary.total ?? "--";
            return shelfSummary.shelves?.[shelf.id] ?? 0;
          })();

          return (
            <ListItemButton
              key={shelf.id}
              selected={isActive}
              onClick={() => {
                setShelfFilter(shelf.id);
                setActiveView("library");
              }}
              sx={{
                borderRadius: 1,
                mb: 0.5,
                '&.Mui-selected': {
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  color: 'primary.main',
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.18),
                  }
                }
              }}
            >
              <ListItemText 
                primary={shelf.label} 
                primaryTypographyProps={{ 
                  fontSize: '0.8125rem',
                  fontWeight: isActive ? 600 : 400
                }} 
              />
              <Typography variant="caption" sx={{ opacity: 0.6, fontSize: '0.625rem' }}>
                {count}
              </Typography>
            </ListItemButton>
          );
        })}
      </List>

      <Divider sx={{ mb: 2 }} />

      <Typography variant="overline" sx={{ mb: 1.5, color: 'text.secondary', fontWeight: 700 }}>
        Filters
      </Typography>
      
      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel id="owned-filter-label" sx={{ fontSize: '0.75rem' }}>Ownership</InputLabel>
        <Select
          labelId="owned-filter-label"
          value={ownedFilter}
          label="Ownership"
          onChange={(e) => setOwnedFilter(e.target.value)}
          sx={{ fontSize: '0.8125rem' }}
        >
          <MenuItem value="all">All books</MenuItem>
          <MenuItem value="owned">Owned only</MenuItem>
          <MenuItem value="unowned">Unowned only</MenuItem>
        </Select>
      </FormControl>

      {hasAnyFilter && (
        <Button
          fullWidth
          variant="outlined"
          color="inherit"
          size="small"
          onClick={() => {
            setSearchQuery("");
            setAuthorFilter("");
            setTagFilter("");
            setShelfFilter("all");
            setOwnedFilter("all");
          }}
          sx={{ mb: 2, fontSize: '0.6875rem', py: 0.5 }}
        >
          Clear all filters
        </Button>
      )}

      {savedFilters.length > 0 && (
        <>
          <Typography variant="overline" sx={{ mb: 1, color: 'text.secondary', fontWeight: 700, display: 'block' }}>
            Saved Filters
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {savedFilters.map((preset) => (
              <Box key={preset.id} sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                <Button
                  fullWidth
                  variant="contained"
                  sx={{ 
                    justifyContent: 'flex-start', 
                    fontSize: '0.6875rem',
                    bgcolor: alpha(theme.palette.divider, 0.05),
                    color: 'text.primary',
                    border: `1px solid ${theme.palette.divider}`,
                    boxShadow: 'none',
                    '&:hover': {
                      bgcolor: alpha(theme.palette.divider, 0.1),
                      boxShadow: 'none'
                    }
                  }}
                  size="small"
                  onClick={() => applySavedFilter(preset)}
                >
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {preset.name || "(unnamed)"}
                  </Box>
                </Button>
                <IconButton 
                  size="small" 
                  onClick={() => handleDeleteSavedFilter(preset.id)}
                  disabled={deleteFilterLoadingId === preset.id}
                  sx={{ 
                    p: 0.5,
                    '&:hover': { color: 'error.main' }
                  }}
                >
                  <DeleteIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
        </>
      )}

      {savedFiltersError && (
        <Typography variant="caption" color="error" sx={{ mt: 1, fontSize: '0.625rem' }}>
          {savedFiltersError}
        </Typography>
      )}
    </Box>
  );
};

export default Sidebar;
