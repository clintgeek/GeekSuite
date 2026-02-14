import { useState, useEffect } from 'react';
import { Box, Container, Typography, Button, Paper, Grid, CircularProgress, LinearProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CameraAlt, PhotoLibrary, EmojiEvents, PlayArrow } from '@mui/icons-material';
import userProjectService from '../services/userProjectService';
import ProjectCard from '../components/ProjectCard';
import projectService from '../services/projectService';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [userProjects, setUserProjects] = useState([]);
  const [activeProjects, setActiveProjects] = useState([]);
  const [completedProjects, setCompletedProjects] = useState([]);
  const [recommendedProject, setRecommendedProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startingProject, setStartingProject] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Load all user projects for stats and active/completed separation
      const allUserProjects = await userProjectService.getUserProjects();
      setUserProjects(allUserProjects);

      const active = allUserProjects.filter((project) => project.status === 'in-progress');
      const completed = allUserProjects.filter((project) => project.status === 'completed');

      setActiveProjects(active);
      setCompletedProjects(completed);

      // If there is no active project, suggest a beginner project
      if (active.length === 0) {
        try {
          const beginnerProjects = await projectService.getProjects({ difficulty: 'beginner' });

          const completedIds = new Set(
            allUserProjects
              .map((p) => (p.projectId && p.projectId._id) || null)
              .filter(Boolean)
          );

          const nextProject =
            beginnerProjects.find((project) => !completedIds.has(project._id)) ||
            beginnerProjects[0] ||
            null;

          setRecommendedProject(nextProject);
        } catch (error) {
          console.error('Error fetching recommended project:', error);
        }
      } else {
        setRecommendedProject(null);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const name = user?.profile?.firstName || 'Photographer';
  const greeting = getGreeting();

  const totalXP = user?.xp || 0;
  const level = user?.level || 1;
  const nextLevelXP = (level + 1) * 500;
  const levelProgress = Math.min((totalXP / nextLevelXP) * 100, 100);

  const completedCount = completedProjects.length;
  const photosUploaded = userProjects.reduce(
    (sum, project) => sum + (project.photos?.length || 0),
    0
  );

  const activeProject = activeProjects[0] || null;

  const handleContinueProject = () => {
    if (!activeProject || !activeProject.projectId?._id) return;
    navigate(`/projects/${activeProject.projectId._id}`);
  };

  const handleStartRecommendedProject = async () => {
    if (!recommendedProject) return;

    try {
      setStartingProject(true);
      const newUserProject = await userProjectService.startProject(recommendedProject._id);
      setActiveProjects((prev) => [newUserProject, ...prev]);
      setRecommendedProject(null);
      navigate(`/projects/${recommendedProject._id}`);
    } catch (error) {
      console.error('Error starting recommended project:', error);
    } finally {
      setStartingProject(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Main Content */}
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Paper elevation={2} sx={{ p: 4, mb: 3 }}>
          <Typography variant="h4" gutterBottom>
            {greeting}, {name}! 📷
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Ready to improve your photography skills today?
          </Typography>

          {/* Continue / Recommended Project */}
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Continue your photography journey
            </Typography>
            {loading ? (
              <CircularProgress />
            ) : activeProject ? (
              <Paper elevation={1} sx={{ p: 3, mt: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Current project
                </Typography>
                <Box sx={{ mt: 1, mb: 2 }}>
                  <ProjectCard project={activeProject.projectId} />
                </Box>
                <Button
                  variant="contained"
                  startIcon={<PlayArrow />}
                  onClick={handleContinueProject}
                >
                  Continue Project
                </Button>
              </Paper>
            ) : recommendedProject ? (
              <Paper elevation={1} sx={{ p: 3, mt: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Recommended next project
                </Typography>
                <Box sx={{ mt: 1, mb: 2 }}>
                  <ProjectCard project={recommendedProject} />
                </Box>
                <Button
                  variant="contained"
                  startIcon={<PlayArrow />}
                  onClick={handleStartRecommendedProject}
                  disabled={startingProject}
                >
                  Start Project
                </Button>
              </Paper>
            ) : (
              <Paper elevation={1} sx={{ p: 3, mt: 1 }}>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Ready for a new challenge? Browse our projects to pick one that fits your next
                  shooting opportunity.
                </Typography>
                <Button variant="outlined" onClick={() => navigate('/projects')}>
                  Browse Projects
                </Button>
              </Paper>
            )}
          </Box>

          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Your Stats
            </Typography>
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Progress to next level
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={levelProgress}
                  sx={{ flexGrow: 1, height: 8, borderRadius: 999 }}
                />
                <Typography variant="body2" color="text.secondary">
                  {Math.round(levelProgress)}%
                </Typography>
              </Box>
            </Box>
            <Grid container spacing={3} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={4}>
                <Paper elevation={1} sx={{ p: 3, textAlign: 'center' }}>
                  <EmojiEvents sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    Level
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="primary">
                    {user?.level || 1}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Paper elevation={1} sx={{ p: 3, textAlign: 'center' }}>
                  <CameraAlt sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    XP
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="primary">
                    {user?.xp || 0}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Paper elevation={1} sx={{ p: 3, textAlign: 'center' }}>
                  <PhotoLibrary sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    Skill Level
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="primary" sx={{ textTransform: 'capitalize' }}>
                    {user?.skillLevel || 'beginner'}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
            <Grid container spacing={3} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6}>
                <Paper elevation={1} sx={{ p: 3, textAlign: 'center' }}>
                  <EmojiEvents sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    Projects Completed
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="primary">
                    {completedCount}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Paper elevation={1} sx={{ p: 3, textAlign: 'center' }}>
                  <PhotoLibrary sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    Photos Uploaded
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="primary">
                    {photosUploaded}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
            <Box sx={{ mt: 3, textAlign: 'center' }}>
              <Button
                variant="outlined"
                onClick={() => navigate('/profile')}
              >
                View Full Profile
              </Button>
            </Box>
          </Box>
        </Paper>

        {/* Active Projects Section */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h5" gutterBottom fontWeight="bold">
            Active Projects
          </Typography>

          {loading ? (
            <CircularProgress />
          ) : activeProjects.length > 0 ? (
            <Grid container spacing={3}>
              {activeProjects.map((userProject) => (
                <Grid item xs={12} sm={6} md={4} key={userProject._id}>
                  <ProjectCard project={userProject.projectId} />
                </Grid>
              ))}
            </Grid>
          ) : (
            <Paper elevation={1} sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary" paragraph>
                You don't have any active projects yet.
              </Typography>
              <Button
                variant="contained"
                startIcon={<PlayArrow />}
                onClick={() => navigate('/projects')}
              >
                Start a New Project
              </Button>
            </Paper>
          )}
        </Box>

        <Paper elevation={2} sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom fontWeight="bold">
            Explore More
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Browse our photography projects to start learning new techniques and improving your skills.
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={<PhotoLibrary />}
            onClick={() => navigate('/projects')}
          >
            Browse All Projects
          </Button>
        </Paper>
      </Container>
    </Box>
  );
};

export default Dashboard;
