import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Button,
  IconButton,
  InputAdornment,
  useTheme,
} from '@mui/material';
import { Search, X } from 'lucide-react';
import { useTemplates } from '../../context/TemplateContext';

const TemplateFilters = () => {
  const theme = useTheme();
  const {
    filters,
    updateFilters,
    clearFilters,
    templateTypes,
  } = useTemplates();

  const mutedInk = theme.palette.text.secondary;

  const hasActiveFilters =
    filters.search || filters.type || filters.tags.length > 0 || filters.isPublic !== undefined;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <TextField
          size="small"
          placeholder="Search templates..."
          value={filters.search}
          onChange={(e) => updateFilters({ search: e.target.value })}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} color={mutedInk} />
              </InputAdornment>
            ),
            endAdornment: filters.search ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => updateFilters({ search: '' })}>
                  <X size={14} />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          sx={{ minWidth: 180, flex: 1 }}
        />

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel id="template-filter-type-label">Type</InputLabel>
          <Select
            labelId="template-filter-type-label"
            value={filters.type}
            onChange={(e) => updateFilters({ type: e.target.value })}
            label="Type"
          >
            <MenuItem value="">All Types</MenuItem>
            {Object.entries(templateTypes).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {hasActiveFilters && (
          <Button
            size="small"
            onClick={clearFilters}
            startIcon={<X size={14} />}
            sx={{
              fontSize: '0.75rem',
              color: mutedInk,
              textTransform: 'none',
              '&:hover': { color: theme.palette.text.primary },
            }}
          >
            Clear
          </Button>
        )}
      </Box>

      {/* Active tag chips */}
      {filters.tags.length > 0 && filters.tags[0] !== '' && (
        <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {filters.tags.filter(Boolean).map((tag, i) => (
            <Chip
              key={i}
              label={tag}
              size="small"
              onDelete={() => {
                const newTags = filters.tags.filter((_, idx) => idx !== i);
                updateFilters({ tags: newTags });
              }}
              sx={{ fontWeight: 500, fontSize: '0.75rem' }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default TemplateFilters;
