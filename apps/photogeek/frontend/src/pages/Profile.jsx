import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Divider,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Chip,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import {
  EmojiEvents,
  TrendingUp,
  CalendarToday,
  Refresh,
  CheckCircle,
} from '@mui/icons-material';
import axios from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const Profile = () => {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/user/stats');
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError('Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  const handleResetProgress = async () => {
    try {
      setResetting(true);
      await axios.post('/api/user/reset');
      setResetDialogOpen(false);
      await fetchStats(); // Refresh stats
    } catch (err) {
      console.error('Error resetting progress:', err);
      setError('Failed to reset progress');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !stats) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">{error || 'Failed to load profile'}</Alert>
      </Container>
    );
  }

  const { user, stats: userStats, completedProjects } = stats;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Your Profile
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {user.email}
        </Typography>
      </Box>

      {/* Stats Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper elevation={2} sx={{ p: 3, textAlign: 'center' }}>
            <EmojiEvents sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
            <Typography variant="h4" fontWeight="bold">
              {userStats.totalXP}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total XP
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper elevation={2} sx={{ p: 3, textAlign: 'center' }}>
            <TrendingUp sx={{ fontSize: 40, color: 'secondary.main', mb: 1 }} />
            <Typography variant="h4" fontWeight="bold">
              {user.level}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Level
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper elevation={2} sx={{ p: 3, textAlign: 'center' }}>
            <CheckCircle sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
            <Typography variant="h4" fontWeight="bold">
              {userStats.completedProjectsCount}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Projects Completed
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper elevation={2} sx={{ p: 3, textAlign: 'center' }}>
            <CalendarToday sx={{ fontSize: 40, color: 'info.main', mb: 1 }} />
            <Typography variant="h4" fontWeight="bold">
              {user.streak?.current || 0}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Day Streak
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Completed Projects */}
      <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" fontWeight="600" gutterBottom>
          Completed Projects
        </Typography>
        <Divider sx={{ my: 2 }} />

        {completedProjects.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            No projects completed yet. Start your first project to begin your journey!
          </Typography>
        ) : (
          <List>
            {completedProjects.map((project, index) => (
              <ListItem
                key={project.projectId}
                sx={{
                  borderBottom: index < completedProjects.length - 1 ? '1px solid' : 'none',
                  borderColor: 'divider',
                  py: 2,
                }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography variant="body1" fontWeight="500">
                        {project.projectTitle}
                      </Typography>
                      <Chip
                        label={`+${ project.xpEarned } XP`}
                        size="small"
                        color="primary"
                        sx={{ height: 20 }}
                      />
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      Completed {new Date(project.completedAt).toLocaleDateString()}
                    </Typography>
                  }
                />
                <Button
                  size="small"
                  onClick={() => navigate(`/projects/${ project.projectId }`)}
                >
                  View
                </Button>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {/* Badges Section (Placeholder) */}
      <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" fontWeight="600" gutterBottom>
          Badges & Achievements
        </Typography>
        <Divider sx={{ my: 2 }} />
        <Typography variant="body2" color="text.secondary">
          Coming soon! Earn badges by completing projects and reaching milestones.
        </Typography>
      </Paper>

      {/* Reset Progress */}
      <Paper elevation={2} sx={{ p: 3, bgcolor: 'error.light' }}>
        <Typography variant="h6" fontWeight="600" gutterBottom color="error.dark">
          Danger Zone
        </Typography>
        <Divider sx={{ my: 2 }} />
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Reset all your progress. This will delete all completed projects and reset your XP and level to 0.
          Your account will remain active.
        </Typography>
        <Button
          variant="outlined"
          color="error"
          startIcon={<Refresh />}
          onClick={() => setResetDialogOpen(true)}
        >
          Reset All Progress
        </Button>
      </Paper>

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetDialogOpen} onClose={() => setResetDialogOpen(false)}>
        <DialogTitle>Reset All Progress?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to reset all your progress? This will:
            <ul>
              <li>Delete all completed projects</li>
              <li>Reset your XP to 0</li>
              <li>Reset your level to 1</li>
              <li>Reset your streak to 0</li>
            </ul>
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleResetProgress} color="error" disabled={resetting}>
            {resetting ? 'Resetting...' : 'Reset Progress'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Profile;
