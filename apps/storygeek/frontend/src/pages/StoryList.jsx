import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Alert, CircularProgress, IconButton, alpha,
} from '@mui/material';
import {
  Add as AddIcon, PlayArrow as PlayIcon, Delete as DeleteIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import useSharedAuthStore from '../store/sharedAuthStore';
import api from '../api';

const genreAccents = {
  'Fantasy':          { color: '#7c4dff', icon: '\u{1F9D9}' },
  'Sci-Fi':           { color: '#00bcd4', icon: '\u{1F680}' },
  'Horror':           { color: '#b71c1c', icon: '\u{1F480}' },
  'Romance':          { color: '#e91e63', icon: '\u{1F339}' },
  'Mystery':          { color: '#607d8b', icon: '\u{1F50D}' },
  'Adventure':        { color: '#ff9800', icon: '\u{1F5FA}' },
  'Historical':       { color: '#795548', icon: '\u{1F3DB}' },
  'Contemporary':     { color: '#4caf50', icon: '\u{1F3D9}' },
  'Post-Apocalyptic': { color: '#ff5722', icon: '\u{2622}' },
  'Steampunk':        { color: '#bf8040', icon: '\u{2699}' },
  'Cyberpunk':        { color: '#e040fb', icon: '\u{1F916}' },
  'Western':          { color: '#a1887f', icon: '\u{1F920}' },
};

const getGenre = (genre) => genreAccents[genre] || { color: '#9e9e9e', icon: '\u{1F4DA}' };

const statusStyles = {
  active:    { label: 'Active',    color: 'success' },
  setup:     { label: 'Setting Up', color: 'warning' },
  paused:    { label: 'Paused',    color: 'warning' },
  completed: { label: 'Complete',  color: 'info' },
  abandoned: { label: 'Abandoned', color: 'error' },
};

function StoryList() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useSharedAuthStore();
  const gold = theme.palette.codex?.gold || '#c9a84c';

  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [startForm, setStartForm] = useState({ prompt: '', title: '', genre: 'Fantasy' });
  const [creatingStory, setCreatingStory] = useState(false);
  const [deletingStory, setDeletingStory] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState(null);

  useEffect(() => {
    if (user && user.id) loadStories();
    else if (user === null) setLoading(false);
  }, [user]);

  const loadStories = async () => {
    try {
      if (!user || !user.id) { setError('Authentication required'); setLoading(false); return; }
      const response = await api.get(`/stories/user/${user.id}`);
      setStories(response.data);
    } catch (err) {
      setError('Failed to load stories');
      console.error('Error loading stories:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartStory = async () => {
    if (!startForm.prompt.trim()) { setError('Please provide a story prompt'); return; }
    if (!user || !user.id) { setError('Authentication required'); return; }
    setCreatingStory(true); setError('');
    try {
      const response = await api.post('/stories/start', {
        userId: user.id, prompt: startForm.prompt,
        title: startForm.title || 'Untitled Story', genre: startForm.genre,
      });
      navigate(`/play/${response.data.storyId}`);
    } catch (err) {
      setError('Failed to start story');
      console.error('Error starting story:', err);
    } finally {
      setCreatingStory(false);
    }
  };

  const handleDeleteStory = async (storyId) => {
    if (!user || !user.id) { setError('Authentication required'); return; }
    setDeletingStory(true); setError('');
    try {
      await api.delete(`/stories/${storyId}`);
      await loadStories();
      setStoryToDelete(null);
    } catch (err) {
      setError('Failed to delete story');
    } finally {
      setDeletingStory(false);
    }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress sx={{ color: gold }} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 4, mt: 1 }}>
        <Box>
          <Typography variant="overline" sx={{ color: alpha(gold, 0.6) }}>
            Your Library
          </Typography>
          <Typography variant="h2" sx={{ mt: 0.5 }}>
            Tales & Quests
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenDialog(true)}>
          New Tale
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {stories.length === 0 ? (
        <Card sx={{ textAlign: 'center', py: 8 }}>
          <CardContent>
            <Typography sx={{
              fontFamily: '"Cinzel Decorative", serif', fontSize: '2rem',
              color: alpha(gold, 0.3), mb: 2,
            }}>
              {'\u{1F4DC}'}
            </Typography>
            <Typography variant="h4" sx={{ mb: 1 }}>
              The shelves are empty
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
              Every great library begins with a single tale. Start your first story and let the ink flow.
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenDialog(true)}>
              Begin Your First Tale
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {stories.map((story, i) => {
            const genre = getGenre(story.genre);
            const status = statusStyles[story.status] || statusStyles.active;
            return (
              <Grid item xs={12} sm={6} lg={4} key={story._id}>
                <Card
                  className="fade-in-up"
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    animationDelay: `${i * 0.06}s`,
                    animationFillMode: 'backwards',
                    // Genre accent strip on left
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      left: 0, top: 0, bottom: 0,
                      width: 4,
                      background: `linear-gradient(180deg, ${genre.color}, ${alpha(genre.color, 0.3)})`,
                    },
                  }}
                  onClick={() => navigate(`/play/${story._id}`)}
                >
                  <CardContent sx={{ flex: 1, pl: 3 }}>
                    {/* Genre & Status */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                      <Typography variant="caption" sx={{
                        color: genre.color,
                        fontWeight: 600,
                      }}>
                        {genre.icon} {story.genre}
                      </Typography>
                      <Chip
                        label={status.label}
                        color={status.color}
                        size="small"
                        sx={{ height: 22, fontSize: '0.65rem' }}
                      />
                    </Box>

                    {/* Title */}
                    <Typography variant="h4" sx={{
                      mb: 1,
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {story.title}
                    </Typography>

                    {/* Stats */}
                    <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {story.stats?.totalInteractions || 0} turns
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {story.stats?.totalDiceRolls || 0} rolls
                      </Typography>
                    </Box>

                    {/* Situation preview */}
                    {story.worldState?.currentSituation && story.worldState.currentSituation !== 'Story setup in progress' && (
                      <Typography variant="body2" color="text.secondary" sx={{
                        fontStyle: 'italic',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        mb: 2,
                      }}>
                        "{story.worldState.currentSituation}"
                      </Typography>
                    )}

                    {/* Footer */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 'auto' }}>
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        {formatDate(story.updatedAt)}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<PlayIcon />}
                          onClick={() => navigate(`/play/${story._id}`)}
                          sx={{ minWidth: 'auto', px: 1.5, py: 0.5, fontSize: '0.75rem' }}
                        >
                          Continue
                        </Button>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setStoryToDelete(story)}
                          disabled={deletingStory}
                          sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* New Story Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontFamily: '"Cinzel", serif' }}>Begin a New Tale</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Describe your vision. The AI Game Master will weave the world around your words.
          </Typography>
          <TextField
            fullWidth label="Story Prompt" value={startForm.prompt}
            onChange={(e) => setStartForm(p => ({ ...p, prompt: e.target.value }))}
            multiline rows={4} placeholder="A wanderer arrives at a fog-shrouded crossroads..."
            required sx={{ mb: 2 }}
          />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth label="Title (Optional)" value={startForm.title}
                onChange={(e) => setStartForm(p => ({ ...p, title: e.target.value }))}
                placeholder="The AI will suggest one"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth select label="Genre" value={startForm.genre}
                onChange={(e) => setStartForm(p => ({ ...p, genre: e.target.value }))}
              >
                {Object.keys(genreAccents).map((g) => (
                  <MenuItem key={g} value={g}>{genreAccents[g].icon} {g}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenDialog(false)} sx={{ color: 'text.secondary' }}>Cancel</Button>
          <Button
            onClick={handleStartStory} variant="contained"
            disabled={creatingStory || !startForm.prompt.trim()}
            startIcon={creatingStory ? <CircularProgress size={18} /> : null}
          >
            {creatingStory ? 'Conjuring...' : 'Begin'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!storyToDelete} onClose={() => setStoryToDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontFamily: '"Cinzel", serif' }}>Erase This Tale?</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 1 }}>
            "{storyToDelete?.title}" will be lost to the void.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            All progress, characters, and events will be permanently destroyed.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setStoryToDelete(null)} sx={{ color: 'text.secondary' }}>Spare It</Button>
          <Button
            onClick={() => handleDeleteStory(storyToDelete?._id)}
            variant="contained" color="error"
            disabled={deletingStory}
          >
            {deletingStory ? 'Erasing...' : 'Destroy'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StoryList;
