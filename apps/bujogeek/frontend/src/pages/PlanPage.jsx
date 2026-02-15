import { Box, Typography, Tab, Tabs } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import WeeklySpread from '../components/plan/WeeklySpread';
import MonthlyCalendar from '../components/plan/MonthlyCalendar';
import BacklogList from '../components/plan/BacklogList';
import { colors } from '../theme/colors';

const subviews = ['weekly', 'monthly', 'backlog'];

const PlanPage = () => {
  const { subview } = useParams();
  const navigate = useNavigate();
  const currentView = subviews.includes(subview) ? subview : 'weekly';

  const handleTabChange = (_, newValue) => {
    navigate(`/plan/${newValue}`);
  };

  return (
    <Box
      sx={{
        maxWidth: 960,
        mx: 'auto',
        px: { xs: 2, sm: 3 },
        py: { xs: 2, sm: 3 },
        pb: 4,
      }}
    >
      {/* Page header */}
      <Typography
        variant="h2"
        sx={{ color: colors.ink[900], mb: 2 }}
      >
        Plan
      </Typography>

      {/* Sub-navigation tabs */}
      <Tabs
        value={currentView}
        onChange={handleTabChange}
        sx={{
          mb: 3,
          minHeight: 36,
          '& .MuiTabs-indicator': {
            backgroundColor: colors.primary[500],
            height: 2,
          },
        }}
      >
        <Tab
          label="Weekly"
          value="weekly"
          sx={{
            textTransform: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
            minHeight: 36,
            px: 2,
            color: colors.ink[500],
            '&.Mui-selected': { color: colors.primary[600] },
          }}
        />
        <Tab
          label="Monthly"
          value="monthly"
          sx={{
            textTransform: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
            minHeight: 36,
            px: 2,
            color: colors.ink[500],
            '&.Mui-selected': { color: colors.primary[600] },
          }}
        />
        <Tab
          label="Backlog"
          value="backlog"
          sx={{
            textTransform: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
            minHeight: 36,
            px: 2,
            color: colors.ink[500],
            '&.Mui-selected': { color: colors.primary[600] },
          }}
        />
      </Tabs>

      {/* Sub-view content */}
      {currentView === 'weekly' && <WeeklySpread />}
      {currentView === 'monthly' && <MonthlyCalendar />}
      {currentView === 'backlog' && <BacklogList />}
    </Box>
  );
};

export default PlanPage;
