import React, { useState } from 'react';
import {
  Box, Typography, TextField, Button, Card, CardContent, Grid,
  Paper, Chip, Alert, CircularProgress, MenuItem, alpha,
} from '@mui/material';
import { Casino as CasinoIcon, Send as SendIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import useSharedAuthStore from '../store/sharedAuthStore';
import useAISettingsStore from '../store/aiSettingsStore';
import api from '../api';

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
  const { user } = useSharedAuthStore();
  const { selectedProvider, selectedModelId } = useAISettingsStore();
  const gold = theme.palette.codex?.gold || '#c9a84c';

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
      const response = await api.post('/stories', {
        ...formData, userId: user.id,
        provider: selectedProvider || 'groq', model: selectedModelId || 'llama3-70b-8192'
      });
      navigate(`/play/${response.data._id}`);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const randomPrompts = [
    'A mysterious artifact is discovered in a sunken temple beneath the desert.',
    'A wandering bard arrives at a town where no one can remember yesterday.',
    'A clockwork automaton awakens in a ruined workshop with one instruction burned into its memory.',
    'A merchant ship emerges from fog carrying cargo from a nation that no longer exists.',
  ];

  return (
    <Box>
      <Box sx={{ mb: 4, mt: 1 }}>
        <Typography variant="overline" sx={{ color: alpha(gold, 0.6) }}>New Adventure</Typography>
        <Typography variant="h2" sx={{ mt: 0.5 }}>Forge a Tale</Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Templates */}
        <Grid item xs={12} md={4}>
          <Typography variant="h5" sx={{ mb: 2 }}>Archetypes</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {storyTemplates.map((t) => {
              const isSelected = selectedTemplate?.name === t.name;
              return (
                <Paper
                  key={t.name}
                  onClick={() => handleTemplateSelect(t)}
                  sx={{
                    p: 2, cursor: 'pointer',
                    border: `1px solid ${alpha(gold, isSelected ? 0.4 : 0.1)}`,
                    background: isSelected
                      ? alpha(gold, 0.08)
                      : 'transparent',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: alpha(gold, 0.3),
                      background: alpha(gold, 0.04),
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                    <Typography sx={{ fontSize: '1.2rem' }}>{t.icon}</Typography>
                    <Typography variant="h6" sx={{ fontSize: '0.9rem' }}>{t.name}</Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem', mb: 1 }}>
                    {t.desc}
                  </Typography>
                  <Chip label={t.genre} size="small"
                    sx={{
                      height: 20, fontSize: '0.65rem',
                      backgroundColor: alpha(gold, isSelected ? 0.2 : 0.08),
                      color: isSelected ? gold : 'text.secondary',
                    }}
                  />
                </Paper>
              );
            })}
          </Box>
        </Grid>

        {/* Form */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ mb: 2.5 }}>Story Details</Typography>

              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

              <Box component="form" onSubmit={handleSubmit}>
                <Grid container spacing={2.5}>
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
                      fullWidth variant="outlined" startIcon={<CasinoIcon />}
                      onClick={() => setFormData(p => ({ ...p, prompt: randomPrompts[Math.floor(Math.random() * randomPrompts.length)] }))}
                      sx={{ height: '100%' }}
                    >
                      Roll for Inspiration
                    </Button>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth label="Story Prompt" value={formData.prompt}
                      onChange={(e) => setFormData(p => ({ ...p, prompt: e.target.value }))}
                      required multiline rows={5}
                      placeholder="Describe your vision. The AI Game Master will weave the world around your words..."
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth label="Additional Details (Optional)" value={formData.description}
                      onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                      multiline rows={2} placeholder="Tone, setting constraints, character ideas..."
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', pt: 1 }}>
                      <Button onClick={() => navigate('/')} sx={{ color: 'text.secondary' }}>Cancel</Button>
                      <Button type="submit" variant="contained" disabled={loading}
                        startIcon={loading ? <CircularProgress size={18} /> : <SendIcon />}>
                        {loading ? 'Conjuring...' : 'Begin the Tale'}
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
