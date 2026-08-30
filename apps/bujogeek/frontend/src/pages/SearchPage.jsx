import { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Button, useTheme } from '@mui/material';
import { FileJson, FileText } from 'lucide-react';
import { useTaskContext } from '../context/TaskContext';
import TaskFilters, { FiltersButton } from '../components/tasks/TaskFilters';
import TaskList from '../components/tasks/TaskList';
import SkeletonLoader from '../components/shared/SkeletonLoader';
import useGlobalShortcuts from '../hooks/useGlobalShortcuts';
import { filterTasks } from '../utils/filterTasks';
import { tasksToJSON, tasksToMarkdown, downloadFile, exportFilename } from '../utils/exportTasks';
import { colors } from '../theme/colors';

/**
 * SearchPage — free-text + faceted search across every task, with a
 * lightweight export toolbar. Reuses the TaskFilters/TaskList pair that
 * was kept around for exactly this after the old TasksPage was retired.
 *
 * Task data is client-side: it pulls the full task set once via
 * fetchAllTasks() and lets TaskFilters/TaskList do the (also client-side)
 * filtering against the shared `filters` context state.
 */
const SearchPage = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { tasks, filters, fetchAllTasks, loading, LoadingState } = useTaskContext();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useGlobalShortcuts();

  useEffect(() => {
    fetchAllTasks();
    // Only needed once on mount — fetchAllTasks is stable (useCallback in context).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same predicate TaskList applies internally — computed here too so the
  // export buttons act on exactly what's on screen.
  const filteredTasks = useMemo(() => filterTasks(tasks, filters), [tasks, filters]);

  const handleExportJSON = () => {
    downloadFile(tasksToJSON(filteredTasks), exportFilename('json'), 'application/json');
  };

  const handleExportMarkdown = () => {
    downloadFile(tasksToMarkdown(filteredTasks), exportFilename('md'), 'text/markdown');
  };

  const isInitialLoading = loading === LoadingState.FETCHING && tasks.length === 0;

  return (
    <Box sx={{ maxWidth: 880, mx: 'auto', px: { xs: 1, sm: 3 }, pb: 4 }}>
      {/* Masthead */}
      <Box sx={{ px: { xs: 2, sm: 0.5 }, pt: { xs: 2.5, sm: 3.5 }, pb: 1 }}>
        <Typography
          sx={{
            fontFamily: '"Fraunces", serif',
            fontSize: '0.8125rem',
            fontWeight: 400,
            fontStyle: 'italic',
            color: isDark ? 'rgba(255,255,255,0.3)' : colors.ink[300],
            mb: 0.5,
            letterSpacing: '0.01em',
          }}
        >
          {filteredTasks.length} result{filteredTasks.length !== 1 ? 's' : ''}
        </Typography>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Typography
            variant="h1"
            sx={{ fontSize: { xs: '1.75rem', sm: '2.25rem' }, color: theme.palette.text.primary, lineHeight: 1.2 }}
          >
            Search
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileJson size={16} />}
              onClick={handleExportJSON}
              sx={{ textTransform: 'none', borderRadius: '8px', fontSize: '0.8125rem' }}
            >
              Export JSON
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileText size={16} />}
              onClick={handleExportMarkdown}
              sx={{ textTransform: 'none', borderRadius: '8px', fontSize: '0.8125rem' }}
            >
              Export Markdown
            </Button>
            <FiltersButton onClick={() => setDrawerOpen(true)} />
          </Box>
        </Box>
      </Box>

      {/* Filters */}
      <Box sx={{ px: { xs: 0.5, sm: 0 }, mb: 1 }}>
        <TaskFilters openDrawer={drawerOpen} setDrawerOpen={setDrawerOpen} />
      </Box>

      {/* Results */}
      {isInitialLoading ? (
        <Box sx={{ px: { xs: 0.5, sm: 0 } }}>
          <SkeletonLoader rows={5} />
        </Box>
      ) : (
        <TaskList tasks={tasks} viewType="search" />
      )}
    </Box>
  );
};

export default SearchPage;
