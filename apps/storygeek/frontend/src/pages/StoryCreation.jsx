import React, { useState } from 'react';
import {
  Box, Typography, TextField, Button, Card, CardContent, Grid,
  ButtonBase, Alert, CircularProgress, MenuItem, alpha,
} from '@mui/material';
import { AutoStories as BeginIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '@geeksuite/auth';
import useAISettingsStore from '../store/aiSettingsStore';
import api from '../api';
import D20 from '../components/primitives/D20';
import { fonts } from '../theme/theme';

const genres = [
  'Fantasy', 'Sci-Fi', 'Horror', 'Romance', 'Mystery', 'Adventure',
  'Historical', 'Contemporary', 'Post-Apocalyptic', 'Steampunk', 'Cyberpunk', 'Western',
];

const storyTemplates = [
  { name: 'The Chosen One', genre: 'Fantasy', icon: '\u{2694}',
    desc: 'Destiny calls a young hero to confront an ancient evil.',
    prompt: 'A young person discovers they are the chosen one destined to save the world from an ancient evil.' },
  { name: 'Void Drifter', genre: 'Sci-Fi', icon: '\u{1F30C}',
    desc: 'An abandoned alien vessel drifts in the silence between stars.',
    prompt: 'A space explorer discovers an abandoned alien ship floating in deep space with mysterious technology.' },
  { name: 'The Red Ledger', genre: 'Mystery', icon: '\u{1F56F}',
    desc: 'A detective follows a trail of crimes that defy natural law.',
    prompt: 'A detective investigates a series of crimes that seem to have supernatural elements.' },
  { name: 'Oathbound', genre: 'Fantasy', icon: '\u{1F6E1}',
    desc: 'A knight\'s oath is tested as dark forces encircle the village.',
    prompt: 'A knight must protect a village from dark forces while uncovering a conspiracy.' },
];

function StoryCreation() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedProvider, selectedModelId } = useAISettingsStore();
  const c = theme.palette.candle;

  const [formData, setFormData] = useState({ title: '', genre: 'Fantasy', prompt: '', description: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const handleTemplateSelect = (t) => {
    setSelectedTemplate(t);
    setFormData(p => ({ ...p, title: t.name, genre: t.genre, prompt: t.prompt }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.genre || !formData.prompt) { setError('Please fill in all required fields'); return; }
    if (!user || !user.id) { setError('Authentication required'); return; }
    setLoading(true); setError('');
    try {
      // `POST /api/stories` does not exist — routes/stories.js only ever
      // defined `/start`. This page 404'd on every submit, then read `_id`
      // off a response shape (`{ storyId }`) that route never returned. And
      // `...formData` plus `userId` both trip `startStorySchema`'s `.strict()`,
      // so the fields have to be named one by one.
      const response = await api.post('/stories/start', {
        title: formData.title,
        genre: formData.genre,
        prompt: formData.prompt,
        ...(formData.description ? { description: formData.description } : {}),
        // provider + model only when the player pinned a model in Settings.
        // Absent means Automatic, which is the default and the common case.
        ...(selectedProvider && selectedModelId ? { provider: selectedProvider, model: selectedModelId } : {})
      });
      // The narrator may decline before a story exists at all: the backend
      // answers 200 `{ type: 'ai_unavailable', reason, message }` and has
      // written nothing. Show its words and leave the form filled in — the
      // player can submit the same prompt again in a minute.
      if (response.data?.type === 'ai_unavailable') {
        setError(response.data.message || 'The narrator is not answering right now. Try again in a moment.');
        return;
      }
      navigate(`/play/${response.data.storyId}`);
    } catch (err) { setError(err.message || 'Failed to start story'); }
    finally { setLoading(false); }
  };

  const randomPrompts = [
    'A mysterious artifact is discovered in a sunken temple beneath the desert.',
    'A wandering bard arrives at a town where no one can remember yesterday.',
    'A clockwork automaton awakens in a ruined workshop with one instruction burned into its memory.',
    'A merchant ship emerges from fog carrying cargo from a nation that no longer exists.',
  ];

  const label = {
    fontFamily: fonts.ui, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.16em',
    textTransform: 'uppercase', color: c.accentLabel,
  };

  return (
    <Box>
      <Box sx={{ mb: { xs: 6, md: 8 }, mt: 2 }}>
        <Typography component="p" sx={label}>New adventure</Typography>
        <Typography variant="h2" component="h1" sx={{ mt: 1, fontSize: { xs: '1.6rem', md: '2rem' } }}>Set the Scene</Typography>
        <Typography sx={{ mt: 1, color: 'text.secondary', fontStyle: 'italic', maxWidth: 560 }}>
          Choose a hook or write your own. The Game Master builds the world from your words.
        </Typography>
      </Box>

      <Grid container spacing={{ xs: 6, md: 8 }}>
        {/* Templates */}
        <Grid item xs={12} md={4}>
          <Typography variant="h5" component="h2" sx={{ mb: 3 }}>Adventure hooks</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {storyTemplates.map((t) => {
              const isSelected = selectedTemplate?.name === t.name;
              return (
                <ButtonBase
                  key={t.name}
                  onClick={() => handleTemplateSelect(t)}
                  aria-pressed={isSelected}
                  sx={{
                    display: 'block', textAlign: 'left', width: '100%', p: 4, borderRadius: '6px',
                    bgcolor: isSelected ? alpha(c.accent, 0.1) : c.paper,
                    border: `1px solid ${isSelected ? c.accent : c.rule}`,
                    boxShadow: isSelected ? `inset 3px 0 0 ${c.accent}` : 'none',
                    transition: 'border-color 160ms ease, background-color 160ms ease',
                    '@media (hover: hover)': { '&:hover': { borderColor: alpha(c.accent, 0.7) } },
                    '&.Mui-focusVisible': { outline: `2px solid ${c.accent}`, outlineOffset: 2 },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                    <Typography component="span" aria-hidden="true" sx={{ fontSize: '1.2rem' }}>{t.icon}</Typography>
                    <Typography component="span" sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: '1rem' }}>{t.name}</Typography>
                  </Box>
                  <Typography component="span" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.9375rem', lineHeight: 1.45, mb: 2 }}>
                    {t.desc}
                  </Typography>
                  <Typography component="span" sx={label}>{t.genre}</Typography>
                </ButtonBase>
              );
            })}
          </Box>
        </Grid>

        {/* Form */}
        <Grid item xs={12} md={8}>
          <Card sx={{ bgcolor: c.page, borderColor: c.pageEdge }}>
            <CardContent sx={{ p: { xs: 5, md: 8 } }}>
              <Typography variant="h5" component="h2" sx={{ mb: 5 }}>The tale</Typography>

              {error && <Alert severity="error" sx={{ mb: 4 }}>{error}</Alert>}

              <Box component="form" onSubmit={handleSubmit}>
                <Grid container spacing={5}>
                  <Grid item xs={12}>
                    <TextField fullWidth label="Title" value={formData.title}
                      onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                      required placeholder="Name your tale..." />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField fullWidth select label="Genre" value={formData.genre}
                      onChange={(e) => setFormData(p => ({ ...p, genre: e.target.value }))} required>
                      {genres.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Button
                      fullWidth variant="outlined"
                      startIcon={<D20 size={20} />}
                      onClick={() => setFormData(p => ({ ...p, prompt: randomPrompts[Math.floor(Math.random() * randomPrompts.length)] }))}
                      sx={{ height: '100%', minHeight: 56 }}
                    >
                      Roll for Inspiration
                    </Button>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth label="Story Prompt" value={formData.prompt}
                      onChange={(e) => setFormData(p => ({ ...p, prompt: e.target.value }))}
                      required multiline minRows={5}
                      placeholder="Describe your vision. The AI Game Master will weave the world around your words..."
                      sx={{ '& textarea': { fontFamily: fonts.text, fontSize: '1.0625rem', lineHeight: 1.6 } }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth label="Additional Details (Optional)" value={formData.description}
                      onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                      multiline minRows={2} placeholder="Tone, setting constraints, character ideas..."
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 3, justifyContent: 'flex-end', flexWrap: 'wrap', pt: 2 }}>
                      <Button onClick={() => navigate('/')} sx={{ color: 'text.secondary', minHeight: 44, px: 4 }}>Cancel</Button>
                      <Button type="submit" variant="contained" disabled={loading} sx={{ minHeight: 44, px: 6 }}
                        startIcon={loading ? <CircularProgress size={18} sx={{ color: 'inherit' }} /> : <BeginIcon />}>
                        {loading ? 'Setting the scene…' : 'Begin the Tale'}
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default StoryCreation;
