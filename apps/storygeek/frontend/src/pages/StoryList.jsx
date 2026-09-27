import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Card, CardActionArea, Grid, TextField,
  MenuItem, CircularProgress, IconButton, alpha,
} from '@mui/material';
import {
  Add as AddIcon, PlayArrow as PlayIcon, Delete as DeleteIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '@geeksuite/auth';
import { GeekEmptyState, GeekErrorState, slashFocusProps, useGeekPrimaryAction, useToast } from '@geeksuite/ui';
import api from '../api';
import CodexDialog from '../components/primitives/CodexDialog';
import D20 from '../components/primitives/D20';
import Tag from '../components/primitives/Tag';
import { fonts } from '../theme/theme';

// Genre colours are wax, not neon: they only ever paint the pin that holds a
// notice to the board (decorative), never text.
const genreAccents = {
  'Fantasy':          { color: '#6b4a9a', icon: '\u{1F9D9}' },
  'Sci-Fi':           { color: '#2f7a86', icon: '\u{1F680}' },
  'Horror':           { color: '#8a1f1f', icon: '\u{1F480}' },
  'Romance':          { color: '#a8406a', icon: '\u{1F339}' },
  'Mystery':          { color: '#4a5a6a', icon: '\u{1F50D}' },
  'Adventure':        { color: '#c9802e', icon: '\u{1F5FA}' },
  'Historical':       { color: '#7a5a3a', icon: '\u{1F3DB}' },
  'Contemporary':     { color: '#4a7a4f', icon: '\u{1F3D9}' },
  'Post-Apocalyptic': { color: '#a84a2a', icon: '\u{2622}' },
  'Steampunk':        { color: '#9a6a2e', icon: '\u{2699}' },
  'Cyberpunk':        { color: '#8a3a8a', icon: '\u{1F916}' },
  'Western':          { color: '#8a6a4a', icon: '\u{1F920}' },
};

const getGenre = (genre) => genreAccents[genre] || { color: '#6b6259', icon: '\u{1F4DA}' };

const statusStyles = {
  active:    { label: 'Active',    tone: 'good' },
  setup:     { label: 'Setting Up', tone: 'warn' },
  paused:    { label: 'Paused',    tone: 'warn' },
  completed: { label: 'Complete',  tone: 'info' },
  abandoned: { label: 'Abandoned', tone: 'bad' },
};

function StoryList() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useToast();
  const c = theme.palette.candle;

  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  // `loadError` gates the whole shelf (GeekErrorState replaces the grid/empty
  // card, with a real retry) — distinct from the transient, dialog-adjacent
  // failures below, which are fire-and-forget toasts.
  const [loadError, setLoadError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [startForm, setStartForm] = useState({ prompt: '', title: '', genre: 'Fantasy' });
  const [creatingStory, setCreatingStory] = useState(false);
  const [deletingStory, setDeletingStory] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState(null);

  useEffect(() => {
    if (user && user.id) loadStories();
    else if (user === null) setLoading(false);
    // Depend on the id, not the object: a fresh user reference per render would
    // re-fire this load forever (see StoryPlay, 2026-09-05).
  }, [user?.id]);

  const loadStories = async () => {
    try {
      if (!user || !user.id) { setLoadError('Authentication required'); setLoading(false); return; }
      setLoadError('');
      const response = await api.get(`/stories/user/${user.id}`);
      setStories(response.data);
    } catch (err) {
      setLoadError(err.message || 'Failed to load stories');
      console.error('Error loading stories:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartStory = async () => {
    // The New Tale dialog sits above this page — a page-level Alert here
    // used to render behind its backdrop. A toast floats above the dialog
    // instead (same fix as fitnessgeek's HouseholdSettings, TODO_ORDER #15).
    if (!startForm.prompt.trim()) { notify('Please provide a story prompt', { tone: 'error' }); return; }
    if (!user || !user.id) { notify('Authentication required', { tone: 'error' }); return; }
    setCreatingStory(true);
    try {
      // No `userId`: `startStorySchema` is `.strict()` and the controller
      // takes the owner from the session (`requireAuth`), so sending it made
      // every single create 400 with "Unrecognized key(s) ... 'userId'".
      const response = await api.post('/stories/start', {
        prompt: startForm.prompt,
        title: startForm.title || 'Untitled Story', genre: startForm.genre,
      });
      navigate(`/play/${response.data.storyId}`);
    } catch (err) {
      notify(err.message || 'Failed to start story', { tone: 'error' });
      console.error('Error starting story:', err);
    } finally {
      setCreatingStory(false);
    }
  };

  const handleDeleteStory = async (storyId) => {
    if (!user || !user.id) { notify('Authentication required', { tone: 'error' }); return; }
    setDeletingStory(true);
    try {
      await api.delete(`/stories/${storyId}`);
      await loadStories();
      setStoryToDelete(null);
    } catch (err) {
      notify(err.message || 'Failed to delete story', { tone: 'error' });
    } finally {
      setDeletingStory(false);
    }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // The one create action, in the thumb zone below `md`. The header button
  // stays at `md`+, where the top of the page is a reachable place to put it.
  useGeekPrimaryAction({
    label: 'New Tale',
    icon: <AddIcon sx={{ fontSize: 26 }} />,
    onClick: () => setOpenDialog(true),
  });

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress aria-label="Loading your tales" />
      </Box>
    );
  }

  const label = {
    fontFamily: fonts.ui, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.16em',
    textTransform: 'uppercase', color: c.accentLabel,
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 4, mb: { xs: 6, md: 8 }, mt: 2 }}>
        <Box>
          <Typography component="p" sx={label}>The table is set</Typography>
          <Typography variant="h2" component="h1" sx={{ mt: 1, fontSize: { xs: '1.6rem', md: '2rem' } }}>
            Your Tales
          </Typography>
          {stories.length > 0 && !loadError && (
            <Typography sx={{ mt: 1, color: 'text.secondary', fontStyle: 'italic' }}>
              {stories.length === 1 ? 'One adventure is waiting for you.' : `${stories.length} adventures are waiting for you.`}
            </Typography>
          )}
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenDialog(true)}
          sx={{ display: { xs: 'none', md: 'inline-flex' }, flexShrink: 0, minHeight: 44, px: 5 }}
        >
          New Tale
        </Button>
      </Box>

      {loadError ? (
        <Card sx={{ textAlign: 'center', py: 12, px: 4 }}>
          <GeekErrorState
            error={loadError}
            onRetry={loadStories}
            title="The shelves won't open"
            description="Something kept the library from answering. Try again."
          />
        </Card>
      ) : stories.length === 0 ? (
        <Box sx={{
          textAlign: 'center', py: { xs: 12, md: 16 }, px: 4, borderRadius: '8px',
          border: `2px dashed ${c.rule}`, bgcolor: alpha(c.paper, 0.6),
        }}>
          <GeekEmptyState
            icon={<D20 size={72} value={20} color={c.accent} fill={alpha(c.accent, 0.08)} strokeWidth={0.9} sx={{ mx: 'auto' }} />}
            title="No tale on the table yet"
            titleSx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: '1.35rem' }}
            description="Pull up a chair. Describe a place, a person, or a trouble, and the Game Master will set the scene."
            descriptionSx={{ maxWidth: 420, mx: 'auto', fontSize: '1.0625rem', color: 'text.secondary' }}
            action={
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenDialog(true)} sx={{ minHeight: 44, px: 5 }}>
                Begin your first tale
              </Button>
            }
          />
        </Box>
      ) : (
        <Grid container spacing={{ xs: 4, md: 6 }}>
          {stories.map((story, i) => {
            const genre = getGenre(story.genre);
            const status = statusStyles[story.status] || statusStyles.active;
            const situation = story.worldState?.currentSituation && story.worldState.currentSituation !== 'Story setup in progress'
              ? story.worldState.currentSituation : null;
            return (
              <Grid item xs={12} sm={6} lg={4} key={story._id}>
                <Card
                  component="article"
                  className="fade-in-up"
                  sx={{
                    height: '100%', display: 'flex', flexDirection: 'column', position: 'relative',
                    overflow: 'visible',
                    animationDelay: `${i * 0.06}s`,
                    bgcolor: c.paper,
                    backgroundImage: c.mode === 'dark'
                      ? `radial-gradient(ellipse 90% 60% at 50% 0%, ${alpha(c.accent, 0.07)} 0%, transparent 70%)`
                      : `radial-gradient(ellipse 90% 60% at 50% 0%, ${alpha('#ffffff', 0.7)} 0%, transparent 70%)`,
                    boxShadow: c.mode === 'dark'
                      ? `0 1px 0 ${alpha('#fff', 0.03)} inset, 0 8px 24px ${alpha('#000', 0.35)}`
                      : `0 1px 2px ${alpha('#3c230a', 0.12)}, 0 8px 20px ${alpha('#3c230a', 0.10)}`,
                    transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
                    '@media (hover: hover)': {
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        borderColor: alpha(c.accent, 0.6),
                        boxShadow: c.mode === 'dark'
                          ? `0 10px 28px ${alpha('#000', 0.45)}, 0 0 24px ${alpha(c.accent, 0.12)}`
                          : `0 10px 24px ${alpha('#3c230a', 0.16)}`,
                      },
                    },
                    '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } },
                  }}
                >
                  {/* The wax pin holding the notice to the board, in the genre's colour. */}
                  <Box aria-hidden="true" sx={{
                    position: 'absolute', top: -9, left: '50%', ml: '-9px', width: 18, height: 18, borderRadius: '50%',
                    background: `radial-gradient(circle at 35% 30%, ${alpha('#fff', 0.45)} 0%, ${genre.color} 45%, ${alpha('#000', 0.35)} 100%)`,
                    boxShadow: `0 2px 3px ${alpha('#000', 0.4)}`,
                  }} />
                  <CardActionArea
                    onClick={() => navigate(`/play/${story._id}`)}
                    aria-label={`Open ${story.title}`}
                    sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', p: { xs: 5, md: 6 }, pb: 3, borderRadius: 'inherit' }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 3 }}>
                      <Typography component="span" sx={{ ...label, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <span aria-hidden="true">{genre.icon}</span>{story.genre}
                      </Typography>
                      <Tag tone={status.tone}>{status.label}</Tag>
                    </Box>

                    <Typography variant="h4" component="h2" sx={{
                      fontSize: '1.3rem', lineHeight: 1.25, mb: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {story.title}
                    </Typography>

                    {situation ? (
                      <Typography sx={{
                        fontStyle: 'italic', color: 'text.secondary', fontSize: '1rem', lineHeight: 1.55,
                        overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                        WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', mb: 3,
                      }}>
                        “{situation}”
                      </Typography>
                    ) : (
                      <Typography sx={{ fontStyle: 'italic', color: 'text.secondary', fontSize: '1rem', mb: 3 }}>
                        The opening scene is still being set.
                      </Typography>
                    )}

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 'auto', color: 'text.secondary', fontFamily: fonts.ui, fontSize: '0.875rem', fontVariantNumeric: 'lining-nums' }}>
                      <D20 size={16} color={c.accentLabel} />
                      <span>{story.stats?.totalInteractions || 0} turns</span>
                      <span aria-hidden="true">·</span>
                      <span>{story.stats?.totalDiceRolls || 0} rolls</span>
                    </Box>
                  </CardActionArea>

                  {/* Footer — outside the action area, so its buttons are not
                      nested inside another button. */}
                  <Box sx={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2,
                    px: { xs: 5, md: 6 }, py: 2, borderTop: `1px dashed ${c.rule}`,
                  }}>
                    <Typography component="span" sx={{ fontFamily: fonts.ui, fontSize: '0.8125rem', color: 'text.secondary', fontVariantNumeric: 'lining-nums' }}>
                      {formatDate(story.updatedAt)}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Button
                        variant="outlined"
                        startIcon={<PlayIcon />}
                        onClick={() => navigate(`/play/${story._id}`)}
                        sx={{ minHeight: 44, px: 3 }}
                      >
                        Continue
                      </Button>
                      {/* Icon-only, and there is one per card — so the name
                          has to carry the title, or a screen-reader user
                          hears "Delete" four times with no way to tell which
                          tale is which. */}
                      <IconButton
                        aria-label={`Delete ${story.title}`}
                        onClick={() => setStoryToDelete(story)}
                        disabled={deletingStory}
                        sx={{
                          width: 44, height: 44, color: 'text.secondary',
                          '@media (hover: hover)': { '&:hover': { color: c.tone.bad, bgcolor: alpha(c.tone.bad, 0.08) } },
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* New Story Dialog — full-screen below `sm`, so the prompt field is a
          real writing surface on a phone instead of a 326px card. The form
          carries an id so the header's "Begin" can submit it. */}
      <CodexDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        title="Begin a New Tale"
        primaryAction={
          <Button
            type="submit" form="new-tale-form" variant="contained"
            disabled={creatingStory || !startForm.prompt.trim()}
            startIcon={creatingStory ? <CircularProgress size={18} /> : null}
          >
            {creatingStory ? 'Conjuring...' : 'Begin'}
          </Button>
        }
        secondaryAction={
          <Button onClick={() => setOpenDialog(false)} sx={{ color: 'text.secondary' }}>Cancel</Button>
        }
      >
        <Box
          component="form" id="new-tale-form"
          onSubmit={(e) => { e.preventDefault(); handleStartStory(); }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Describe your vision. The AI Game Master will weave the world around your words.
          </Typography>
          <TextField
            fullWidth label="Story Prompt" value={startForm.prompt}
            onChange={(e) => setStartForm(p => ({ ...p, prompt: e.target.value }))}
            multiline rows={4} placeholder="A wanderer arrives at a fog-shrouded crossroads..."
            required sx={{ mb: 2 }}
            // The dialog's `/` target (the page behind it is aria-hidden).
            inputProps={slashFocusProps(10, { select: false })}
          />
          <Grid container columnSpacing={2} rowSpacing={3}>
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
        </Box>
      </CodexDialog>

      {/* Delete confirmation — `mode="window"` on purpose: two lines of "are
          you sure" do not earn the whole screen, on any width. */}
      <CodexDialog
        open={!!storyToDelete}
        onClose={() => setStoryToDelete(null)}
        title="Erase This Tale?"
        mode="window"
        maxWidth="xs"
        primaryAction={
          <Button
            onClick={() => handleDeleteStory(storyToDelete?._id)}
            variant="contained" color="error"
            disabled={deletingStory}
          >
            {deletingStory ? 'Erasing...' : 'Destroy'}
          </Button>
        }
        secondaryAction={
          <Button onClick={() => setStoryToDelete(null)} sx={{ color: 'text.secondary' }}>Spare It</Button>
        }
      >
        <Typography variant="body1" sx={{ mb: 1 }}>
          "{storyToDelete?.title}" will be lost to the void.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          All progress, characters, and events will be permanently destroyed.
        </Typography>
      </CodexDialog>

    </Box>
  );
}

export default StoryList;
