import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  PlayArrow as PlayIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Book as BookIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import useSharedAuthStore from '../store/sharedAuthStore';

const API_URL = import.meta.env.VITE_API_URL;

function StoryList() {
  const navigate = useNavigate();
  const { user, token } = useSharedAuthStore();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [startForm, setStartForm] = useState({
    prompt: '',
    title: '',
    genre: 'Fantasy'
  });
  const [creatingStory, setCreatingStory] = useState(false);
  const [deletingStory, setDeletingStory] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState(null);

  useEffect(() => {
    console.log('StoryList useEffect - user:', user);
    if (user && user.id) {
      console.log('Loading stories for user:', user.id);
      loadStories();
    } else if (user === null) {
      // User is not authenticated, don't load stories
      setLoading(false);
    } else {
      console.log('User object missing id:', user);
    }
  }, [user]);

  const loadStories = async () => {
    try {
      if (!user || !user.id || !token) {
        setError('Authentication required');
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/stories/user/${user.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load stories');
      }

      const storiesData = await response.json();
      setStories(storiesData);
    } catch (error) {
      setError('Failed to load stories');
      console.error('Error loading stories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartStory = async () => {
    if (!startForm.prompt.trim()) {
      setError('Please provide a story prompt');
      return;
    }

    if (!user || !user.id || !token) {
      setError('Authentication required');
      return;
    }

    setCreatingStory(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/stories/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          prompt: startForm.prompt,
          title: startForm.title || 'Untitled Story',
          genre: startForm.genre,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start story');
      }

      const data = await response.json();

      // Navigate to the new story
      navigate(`/play/${data.storyId}`);

    } catch (error) {
      setError('Failed to start story');
      console.error('Error starting story:', error);
    } finally {
      setCreatingStory(false);
    }
  };

  const handleDeleteStory = async (storyId) => {
    if (!user || !user.id || !token) {
      setError('Authentication required');
      return;
    }

    setDeletingStory(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/stories/${storyId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete story');
      }

      // Reload stories after successful deletion
      await loadStories();
      setStoryToDelete(null);

    } catch (error) {
      setError('Failed to delete story');
      console.error('Error deleting story:', error);
    } finally {
      setDeletingStory(false);
    }
  };

  const handleInputChange = (field) => (event) => {
    setStartForm(prev => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'setup': return 'warning';
      case 'paused': return 'warning';
      case 'completed': return 'info';
      case 'abandoned': return 'error';
      default: return 'default';
    }
  };

  const getGenreIcon = (genre) => {
    switch (genre.toLowerCase()) {
      case 'fantasy': return '🧙‍♂️';
      case 'sci-fi': return '🚀';
      case 'horror': return '👻';
      case 'romance': return '💕';
      case 'mystery': return '🔍';
      case 'adventure': return '🗺️';
      default: return '📚';
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4">
          My Stories
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenDialog(true)}
        >
          Start New Story
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {stories.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" gutterBottom>
              No stories yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Start your first story by clicking the button above or typing /start
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpenDialog(true)}
            >
              Start Your First Story
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {stories.map((story) => (
            <Grid item xs={12} md={6} lg={4} key={story._id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" sx={{ flex: 1 }}>
                      {story.title}
                    </Typography>
                    <Chip
                      label={story.status}
                      color={getStatusColor(story.status)}
                      size="small"
                    />
                  </Box>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {getGenreIcon(story.genre)} {story.genre}
                  </Typography>

                  <Typography variant="body2" sx={{ mb: 2 }}>
                    Chapter {story.worldState?.currentChapter || 1}
                  </Typography>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(story.updatedAt)}
                    </Typography>

                  </Box>

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<PlayIcon />}
                      onClick={() => navigate(`/play/${story._id}`)}
                      sx={{ flex: 1 }}
                    >
                      Continue
                    </Button>
                    <IconButton size="small">
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setStoryToDelete(story)}
                      disabled={deletingStory}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Start Story Dialog */}
      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Start New Story</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Describe your story idea. Be as detailed or brief as you like. The AI will help you build the world around your prompt.
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Story Prompt"
                value={startForm.prompt}
                onChange={handleInputChange('prompt')}
                multiline
                rows={4}
                placeholder="Describe your story idea, characters, world, or situation..."
                required
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Story Title (Optional)"
                value={startForm.title}
                onChange={handleInputChange('title')}
                placeholder="Leave empty for AI to suggest a title"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                select
                label="Genre"
                value={startForm.genre}
                onChange={handleInputChange('genre')}
              >
                <MenuItem value="Fantasy">Fantasy</MenuItem>
                <MenuItem value="Sci-Fi">Sci-Fi</MenuItem>
                <MenuItem value="Horror">Horror</MenuItem>
                <MenuItem value="Romance">Romance</MenuItem>
                <MenuItem value="Mystery">Mystery</MenuItem>
                <MenuItem value="Adventure">Adventure</MenuItem>
                <MenuItem value="Historical">Historical</MenuItem>
                <MenuItem value="Contemporary">Contemporary</MenuItem>
                <MenuItem value="Post-Apocalyptic">Post-Apocalyptic</MenuItem>
                <MenuItem value="Steampunk">Steampunk</MenuItem>
                <MenuItem value="Cyberpunk">Cyberpunk</MenuItem>
                <MenuItem value="Western">Western</MenuItem>
              </TextField>
            </Grid>
          </Grid>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleStartStory}
            variant="contained"
            disabled={creatingStory || !startForm.prompt.trim()}
            startIcon={creatingStory ? <CircularProgress size={20} /> : <AddIcon />}
          >
            {creatingStory ? 'Creating Story...' : 'Start Story'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!storyToDelete}
        onClose={() => setStoryToDelete(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Story</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to delete "{storyToDelete?.title}"?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This action cannot be undone. All story progress, characters, and events will be permanently lost.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStoryToDelete(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => handleDeleteStory(storyToDelete?._id)}
            variant="contained"
            color="error"
            disabled={deletingStory}
            startIcon={deletingStory ? <CircularProgress size={20} /> : <DeleteIcon />}
          >
            {deletingStory ? 'Deleting...' : 'Delete Story'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StoryList;