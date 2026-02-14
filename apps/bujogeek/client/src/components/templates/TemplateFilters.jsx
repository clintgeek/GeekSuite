import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Stack,
  Button,
  IconButton,
  InputAdornment
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { useTemplates } from '../../context/TemplateContext';

const TemplateFilters = () => {
  const {
    filters,
    updateFilters,
    clearFilters,
    templateTypes
  } = useTemplates();

  const handleTypeChange = (event) => {
    updateFilters({ type: event.target.value });
  };

  const handleSearchChange = (event) => {
    updateFilters({ search: event.target.value });
  };

  const handleTagChange = (event) => {
    const tags = event.target.value.split(',').map(tag => tag.trim());
    updateFilters({ tags });
  };

  const handlePublicChange = (event) => {
    updateFilters({ isPublic: event.target.value === 'true' });
  };

  const clearSearch = () => {
    updateFilters({ search: '' });
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" spacing={2} alignItems="center">
        <TextField
          size="small"
          placeholder="Search templates..."
          value={filters.search}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: filters.search && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={clearSearch}>
                  <ClearIcon />
                </IconButton>
              </InputAdornment>
            )
          }}
        />

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Type</InputLabel>
          <Select
            value={filters.type}
            onChange={handleTypeChange}
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

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Visibility</InputLabel>
          <Select
            value={filters.isPublic === undefined ? '' : filters.isPublic.toString()}
            onChange={handlePublicChange}
            label="Visibility"
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="true">Public</MenuItem>
            <MenuItem value="false">Private</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <TextField
            size="small"
            label="Tags"
            placeholder="tag1, tag2"
            value={filters.tags.join(', ')}
            onChange={handleTagChange}
          />
        </FormControl>

        <Button
          variant="outlined"
          onClick={clearFilters}
          startIcon={<ClearIcon />}
        >
          Clear Filters
        </Button>
      </Stack>

      {filters.tags.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1}>
            {filters.tags.map((tag, index) => (
              <Chip
                key={index}
                label={tag}
                onDelete={() => {
                  const newTags = filters.tags.filter((_, i) => i !== index);
                  updateFilters({ tags: newTags });
                }}
              />
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
};

export default TemplateFilters;