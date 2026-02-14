import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Grid,
  Divider,
} from '@mui/material';
import {
  ArrowBack,
  CameraAlt,
  AccessTime,
  EmojiEvents,
  LocationOn,
  PlayArrow,
  CheckCircle,
} from '@mui/icons-material';
import projectService from '../services/projectService';
import userProjectService from '../services/userProjectService';
import { useAuth } from '../contexts/AuthContext';
import PhotoUpload from '../components/PhotoUpload';
import ProjectChat from '../components/ProjectChat';
import TipCard from '../components/TipCard';

const ProjectDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [project, setProject] = useState(null);
  const [userProject, setUserProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProjectData();
  }, [id, isAuthenticated]);

  const fetchProjectData = async () => {
    try {
      setLoading(true);
      const projectData = await projectService.getProjectById(id);
      setProject(projectData);

      if (isAuthenticated) {
        const userProjectData = await userProjectService.getProjectStatus(id);
        setUserProject(userProjectData);
      }
    } catch (err) {
      setError('Failed to load project. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartProject = async () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/projects/${ id }` } });
      return;
    }

    try {
      setActionLoading(true);
      const newUserProject = await userProjectService.startProject(id);
      setUserProject(newUserProject);
    } catch (err) {
      console.error('Error starting project:', err);
      // Ideally show a snackbar here
    } finally {
      setActionLoading(false);
    }
  };

  const handlePhotoUploadSuccess = async (photoUrl) => {
    try {
      setActionLoading(true);
      const updatedUserProject = await userProjectService.submitPhoto(id, photoUrl);
      setUserProject(updatedUserProject);
    } catch (err) {
      console.error('Error submitting photo:', err);
      setError('Failed to submit project. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveProject = async () => {
    try {
      setActionLoading(true);
      await userProjectService.leaveProject(id);
      setUserProject(null); // Clear the user project state
    } catch (err) {
      console.error('Error leaving project:', err);
      setError('Failed to leave project. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '50vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error || !project) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">{error || 'Project not found'}</Alert>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate('/projects')}
          sx={{ mt: 2 }}
        >
          Back to Projects
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Button
        startIcon={<ArrowBack />}
        onClick={() => navigate('/projects')}
        sx={{ mb: 3 }}
      >
        Back to Projects
      </Button>

      <Paper elevation={2} sx={{ p: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <Chip label={project.difficulty} color="primary" />
                <Chip
                  icon={<EmojiEvents />}
                  label={`${ project.xpReward } XP`}
                  color="secondary"
                />
                <Chip icon={<AccessTime />} label={project.estimatedTime} />
                {userProject && (
                  <Chip
                    icon={<CheckCircle />}
                    label={userProject.status === 'completed' ? 'Completed' : 'In Progress'}
                    color={userProject.status === 'completed' ? 'success' : 'info'}
                    variant="filled"
                  />
                )}
              </Box>

              <Typography variant="h4" gutterBottom fontWeight="bold">
                {project.title}
              </Typography>
            </Box>

            {/* Action Button (Top Right) */}
            <Box>
              {!userProject ? (
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<PlayArrow />}
                  onClick={handleStartProject}
                  disabled={actionLoading}
                >
                  Start Project
                </Button>
              ) : userProject.status !== 'completed' ? (
                <Button
                  variant="outlined"
                  size="large"
                  color="error"
                  onClick={handleLeaveProject}
                  disabled={actionLoading}
                >
                  Leave Project
                </Button>
              ) : null}
            </Box>
          </Box>

          <Typography variant="body1" color="text.secondary" paragraph>
            {project.description}
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Project Details */}
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              <CameraAlt sx={{ mr: 1, verticalAlign: 'middle' }} />
              Technique
            </Typography>
            <Typography variant="body1" paragraph>
              {project.technique.name}
            </Typography>

            <Typography variant="h6" gutterBottom fontWeight="bold">
              <LocationOn sx={{ mr: 1, verticalAlign: 'middle' }} />
              Location & Setup
            </Typography>
            <Typography variant="body2" paragraph>
              <strong>Subject:</strong> {project.subject}
            </Typography>
            <Typography variant="body2" paragraph>
              <strong>Location:</strong> {project.location}
            </Typography>
            <Typography variant="body2" paragraph>
              <strong>Lighting:</strong> {project.lighting}
            </Typography>
          </Grid>

          <Grid item xs={12} md={6}>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              📷 Camera Settings
            </Typography>
            <Box sx={{ bgcolor: 'background.default', p: 2, borderRadius: 1 }}>
              <Typography variant="body2" paragraph>
                <strong>Mode:</strong> {project.cameraSettings.mode}
              </Typography>
              <Typography variant="body2" paragraph>
                <strong>Aperture:</strong> {project.cameraSettings.aperture}
              </Typography>
              <Typography variant="body2" paragraph>
                <strong>Shutter Speed:</strong> {project.cameraSettings.shutterSpeed}
              </Typography>
              <Typography variant="body2">
                <strong>ISO:</strong> {project.cameraSettings.iso}
              </Typography>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

        {/* Learning Objectives */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom fontWeight="600" sx={{ mb: 2 }}>
            What you'll learn:
          </Typography>
          <Box component="ol" sx={{ pl: 3, m: 0 }}>
            {project.learningObjectives.map((objective, index) => (
              <Typography
                component="li"
                key={index}
                variant="body2"
                color="text.secondary"
                sx={{ mb: 1.5, lineHeight: 1.6 }}
              >
                {objective}
              </Typography>
            ))}
          </Box>
        </Box>

        {/* Tips */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom fontWeight="600" sx={{ mb: 2 }}>
            Tips & Insights:
          </Typography>
          <Box>
            {project.tips.map((tip, index) => (
              <TipCard key={index} tip={tip} index={index} />
            ))}
          </Box>
        </Box>

        {/* Tags */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom fontWeight="bold">
            Tags
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {project.tags.map((tag, index) => (
              <Chip key={index} label={tag} size="small" variant="outlined" />
            ))}
          </Box>
        </Box>

        {/* Action Section (Bottom) */}
        <Box sx={{ mt: 4 }}>
          {!userProject ? (
            <Box sx={{ textAlign: 'center' }}>
              <Button
                variant="contained"
                size="large"
                startIcon={<PlayArrow />}
                onClick={handleStartProject}
                disabled={actionLoading}
              >
                Start Project
              </Button>
            </Box>
          ) : userProject.status === 'completed' ? (
            <Paper elevation={1} sx={{ p: 3, bgcolor: 'success.light', color: 'success.contrastText', textAlign: 'center' }}>
              <CheckCircle sx={{ fontSize: 48, mb: 1 }} />
              <Typography variant="h5" fontWeight="bold" gutterBottom>
                Project Completed!
              </Typography>
              <Typography variant="body1">
                Great job! You've earned {project.xpReward} XP.
              </Typography>
              {userProject.photos && userProject.photos.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Your Submission:
                  </Typography>
                  <Box
                    component="img"
                    src={userProject.photos[userProject.photos.length - 1].url}
                    alt="Submission"
                    sx={{ maxWidth: '100%', maxHeight: 300, borderRadius: 1, mb: 2 }}
                  />

                  {userProject.photos[userProject.photos.length - 1].exifData && userProject.photos[userProject.photos.length - 1].exifData.camera && (
                    <Box sx={{ textAlign: 'left', bgcolor: 'background.paper', p: 2, borderRadius: 1, color: 'text.primary' }}>
                      <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                        EXIF Data
                      </Typography>
                      <Grid container spacing={1}>
                        <Grid item xs={6}>
                          <Typography variant="caption" display="block" color="text.secondary">Camera</Typography>
                          <Typography variant="body2">{userProject.photos[userProject.photos.length - 1].exifData.camera}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" display="block" color="text.secondary">Lens</Typography>
                          <Typography variant="body2">{userProject.photos[userProject.photos.length - 1].exifData.lens || 'Unknown'}</Typography>
                        </Grid>
                        <Grid item xs={3}>
                          <Typography variant="caption" display="block" color="text.secondary">Aperture</Typography>
                          <Typography variant="body2">{userProject.photos[userProject.photos.length - 1].exifData.aperture}</Typography>
                        </Grid>
                        <Grid item xs={3}>
                          <Typography variant="caption" display="block" color="text.secondary">Shutter</Typography>
                          <Typography variant="body2">{userProject.photos[userProject.photos.length - 1].exifData.shutterSpeed}</Typography>
                        </Grid>
                        <Grid item xs={3}>
                          <Typography variant="caption" display="block" color="text.secondary">ISO</Typography>
                          <Typography variant="body2">{userProject.photos[userProject.photos.length - 1].exifData.iso}</Typography>
                        </Grid>
                        <Grid item xs={3}>
                          <Typography variant="caption" display="block" color="text.secondary">Focal Length</Typography>
                          <Typography variant="body2">{userProject.photos[userProject.photos.length - 1].exifData.focalLength}</Typography>
                        </Grid>
                      </Grid>
                    </Box>
                  )}
                </Box>
              )}
              <Button
                variant="contained"
                size="large"
                startIcon={<PlayArrow />}
                onClick={handleStartProject}
                disabled={actionLoading}
                sx={{ mt: 3 }}
              >
                Restart Project
              </Button>
            </Paper>
          ) : (
            <Box>
              <Typography variant="h6" gutterBottom fontWeight="bold" sx={{ mb: 2 }}>
                Submit Your Work
              </Typography>
              <PhotoUpload onUploadSuccess={handlePhotoUploadSuccess} />

              <ProjectChat
                projectId={id}
                initialHistory={userProject.chatHistory || []}
              />
            </Box>
          )}
        </Box>
      </Paper>
    </Container>
  );
};

export default ProjectDetail;
