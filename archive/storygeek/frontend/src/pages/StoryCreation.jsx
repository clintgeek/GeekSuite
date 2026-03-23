import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Grid,
  Paper,
  Chip,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  Book as BookIcon,
  Casino as CasinoIcon,
  Send as SendIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import useSharedAuthStore from '../store/sharedAuthStore';
import useAISettingsStore from '../store/aiSettingsStore';

const API_URL = import.meta.env.VITE_API_URL;

const genres = [
  'Fantasy',
  'Sci-Fi',
  'Horror',
  'Romance',
  'Mystery',
  'Adventure',
  'Historical',
  'Contemporary',
  'Post-Apocalyptic',
  'Steampunk',
  'Cyberpunk',
  'Western',
];

function StoryCreation() {
  const navigate = useNavigate();
  const { user, token } = useSharedAuthStore();
  const { selectedProvider, selectedModelId } = useAISettingsStore();
  const [formData, setFormData] = useState({
    title: '',
    genre: 'Fantasy',
    prompt: '',
    description: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const storyTemplates = [
    {
      name: 'The Chosen One',
      genre: 'Fantasy',
      description: 'A young hero discovers their destiny and must save the world.',
      prompt: 'A young person discovers they are the chosen one destined to save the world from an ancient evil.'
    },
    {
      name: 'Space Explorer',
      genre: 'Sci-Fi',
      description: 'An astronaut discovers an abandoned alien ship in deep space.',
      prompt: 'A space explorer discovers an abandoned alien ship floating in deep space with mysterious technology.'
    },
    {
      name: 'Detective Mystery',
      genre: 'Mystery',
      description: 'A detective investigates a series of supernatural crimes.',
      prompt: 'A detective investigates a series of crimes that seem to have supernatural elements.'
    },
    {
      name: 'Medieval Quest',
      genre: 'Fantasy',
      description: 'A knight must protect a village from dark forces.',
      prompt: 'A knight must protect a village from dark forces while uncovering a conspiracy.'
    }
  ];

  const handleInputChange = (field) => (event) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setFormData(prev => ({
      ...prev,
      title: template.name,
      genre: template.genre,
      prompt: template.prompt
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.title || !formData.genre || !formData.prompt) {
      setError('Please fill in all required fields');
      return;
    }

    if (!user || !user.id || !token) {
      setError('Authentication required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/stories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          userId: user.id,
          provider: selectedProvider || 'groq',
          model: selectedModelId || 'llama3-70b-8192'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create story');
      }

      const story = await response.json();
      navigate(`/play/${story._id}`);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateRandomPrompt = () => {
    const prompts = [
      'A mysterious artifact is discovered in an ancient temple.',
      'A young wizard learns they have a special destiny.',
      'A group of adventurers find a map to hidden treasure.',
      'A detective investigates a series of supernatural crimes.',
      'A space explorer discovers an abandoned alien ship.',
      'A knight must protect a village from dark forces.',
      'A scientist creates a device that opens portals to other worlds.',
      'A thief steals a powerful magical item.',
    ];

    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
    setFormData(prev => ({
      ...prev,
      prompt: randomPrompt
    }));
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ mb: 4 }}>
        Create New Story
      </Typography>

      <Grid container spacing={4}>
        {/* Story Templates */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <BookIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Story Templates
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Choose a template to get started quickly, or create your own story from scratch.
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {storyTemplates.map((template) => (
                  <Paper
                    key={template.name}
                    sx={{
                      p: 2,
                      cursor: 'pointer',
                      border: selectedTemplate?.name === template.name ? 2 : 1,
                      borderColor: selectedTemplate?.name === template.name ? 'primary.main' : 'divider',
                      backgroundColor: selectedTemplate?.name === template.name ? 'primary.main' : 'background.paper',
                      color: selectedTemplate?.name === template.name ? 'white' : 'text.primary',
                      '&:hover': {
                        borderColor: 'primary.main',
                        backgroundColor: selectedTemplate?.name === template.name ? 'primary.dark' : 'action.hover',
                      },
                    }}
                    onClick={() => handleTemplateSelect(template)}
                  >
                    <Typography variant="subtitle1" fontWeight="bold">
                      {template.name}
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      {template.description}
                    </Typography>
                    <Chip
                      label={template.genre}
                      size="small"
                      sx={{
                        backgroundColor: selectedTemplate?.name === template.name ? 'white' : 'primary.main',
                        color: selectedTemplate?.name === template.name ? 'primary.main' : 'white',
                      }}
                    />
                  </Paper>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Story Creation Form */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <SendIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Story Details
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Story Title"
                      value={formData.title}
                      onChange={handleInputChange('title')}
                      required
                      placeholder="Enter your story title..."
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      select
                      label="Genre"
                      value={formData.genre}
                      onChange={handleInputChange('genre')}
                      required
                      helperText="Select a genre for your story"
                    >
                      {genres.map((genre) => (
                        <MenuItem key={genre} value={genre}>
                          {genre}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Story Prompt"
                      value={formData.prompt}
                      onChange={handleInputChange('prompt')}
                      required
                      multiline
                      rows={4}
                      placeholder="Describe your story idea, characters, or world..."
                      helperText="Be as detailed or brief as you like. The AI will build the world around your prompt."
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <Button
                      variant="outlined"
                      onClick={generateRandomPrompt}
                      startIcon={<CasinoIcon />}
                      sx={{ mr: 2 }}
                    >
                      Generate Random Prompt
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<CasinoIcon />}
                    >
                      Roll for Inspiration
                    </Button>
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Additional Details (Optional)"
                      value={formData.description}
                      onChange={handleInputChange('description')}
                      multiline
                      rows={3}
                      placeholder="Any additional details about your story..."
                    />
                  </Grid>

                  <Grid item xs={12}>
                    {/* Removed Divider as it's not in the new_code */}
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      <Button
                        variant="outlined"
                        onClick={() => navigate('/')}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="contained"
                        disabled={loading}
                        startIcon={loading ? <CircularProgress size={20} /> : <SendIcon />}
                      >
                        {loading ? 'Creating Story...' : 'Create Story'}
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