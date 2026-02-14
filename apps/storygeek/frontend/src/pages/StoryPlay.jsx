import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  Divider,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress
} from '@mui/material';
import { useTheme, useMediaQuery, ButtonGroup } from '@mui/material';
import {
  Send as SendIcon,
  Casino as CasinoIcon,
  Refresh as RefreshIcon,
  Save as SaveIcon,
  Bookmark as BookmarkIcon
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import useSharedAuthStore from '../store/sharedAuthStore';
import useAISettingsStore from '../store/aiSettingsStore';

const API_URL = import.meta.env.VITE_API_URL;

function StoryPlay() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { storyId } = useParams();
  const navigate = useNavigate();
  const { user, token } = useSharedAuthStore();
  const { selectedProvider, selectedModelId } = useAISettingsStore();
  const [story, setStory] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportData, setExportData] = useState(null);
  const containerRef = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else if (containerRef.current) {
      const el = containerRef.current;
      el.scrollTop = el.scrollHeight;
    }
  };

  const scrollToTopOfNewResponse = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
    // Keep the composer focused so the player can quickly respond after AI messages
    if (inputRef.current) {
      try { inputRef.current.focus(); } catch (_) {}
    }
  }, [messages]);

  useEffect(() => {
    if (user && user.id) {
      loadStory();
    }
  }, [storyId, user]);

  const loadStory = async () => {
    try {
      if (!user || !user.id || !token) {
        setError('Authentication required');
        return;
      }

      const response = await fetch(`${API_URL}/stories/${storyId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load story');
      }

      const storyData = await response.json();
      setStory(storyData);

      // Convert story events to messages
      const storyMessages = storyData.events.map(event => ({
        type: 'ai',
        content: event.description,
        timestamp: new Date(event.timestamp),
        diceResults: event.diceResults || []
      }));

      setMessages(storyMessages);

    } catch (error) {
      setError('Failed to load story');
      console.error('Error loading story:', error);
    }
  };

  const handleBookify = async () => {
    if (!storyId || !token) return;
    setExporting(true);
    setExportError('');
    setExportOpen(true);
    try {
      const res = await fetch(`${API_URL}/export/stories/${storyId}/bookify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error('Failed to bookify story');
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Bookify failed');
      setExportData(json.data);
    } catch (e) {
      setExportError(e.message || 'Bookify failed');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadTxt = () => {
    if (!exportData) return;
    const blob = new Blob([exportData.content || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = (exportData.title || 'story').replace(/[^a-z0-9\-_]+/gi, '_');
    a.href = url;
    a.download = `${safeTitle}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!userInput.trim() || loading) return;

    const input = userInput.trim();
    setUserInput('');

    // Add user message
    const userMessage = {
      type: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/stories/${storyId}/continue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          userInput: input,
          provider: selectedProvider || 'groq',
          model: selectedModelId || 'llama3-70b-8192'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to continue story');
      }

      const data = await response.json();

      // Handle special command responses
      if (data.type) {
        handleSpecialResponse(data);
        return;
      }

      // Add AI response
      const aiMessage = {
        type: 'ai',
        content: data.aiResponse,
        timestamp: new Date(),
        diceResults: data.diceResult ? [data.diceResult] : [],
        diceMeta: data.diceMeta || null
      };

      setMessages(prev => [...prev, aiMessage]);

      // Update story data
      if (story) {
        setStory(prev => ({
          ...prev,
          stats: {
            ...prev.stats,
            totalInteractions: data.totalInteractions
          }
        }));
      }

    } catch (error) {
      setError('Failed to continue story');
      console.error('Error continuing story:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSpecialResponse = (data) => {
    switch (data.type) {
      case 'character_list':
        setMessages(prev => [...prev, {
          type: 'system',
          content: `Available characters:\n${data.characters.map(char =>
            `- ${char.name}: ${char.description}${char.isActive ? ' (Active)' : ' (Inactive)'}`
          ).join('\n')}`,
          timestamp: new Date()
        }]);
        break;

      case 'character_info':
        setMessages(prev => [...prev, {
          type: 'system',
          content: `Character: ${data.character.name}\nDescription: ${data.character.description}\nPersonality: ${data.character.personality || 'Not specified'}\nBackground: ${data.character.background || 'Not specified'}\nCurrent State: ${data.character.currentState || 'Not specified'}`,
          timestamp: new Date()
        }]);
        break;

      case 'checkpoint_created':
        setMessages(prev => [...prev, {
          type: 'system',
          content: `✅ ${data.message}`,
          timestamp: new Date()
        }]);
        break;

      case 'checkpoint_restored':
        setMessages(prev => [...prev, {
          type: 'system',
          content: `🔄 ${data.message}`,
          timestamp: new Date()
        }]);
        // Reload story to reflect restored state
        loadStory();
        break;

      case 'checkpoint_list':
        setMessages(prev => [...prev, {
          type: 'system',
          content: `Available checkpoints:\n${data.checkpoints.map(cp =>
            `- ${cp.description} (${cp.id}) - ${new Date(cp.timestamp).toLocaleString()} - ${cp.eventCount} events`
          ).join('\n')}`,
          timestamp: new Date()
        }]);
        break;

      case 'info':
        setMessages(prev => [...prev, {
          type: 'system',
          content: `Information about "${data.query}":\n${JSON.stringify(data.details, null, 2)}`,
          timestamp: new Date()
        }]);
        break;

      case 'timeout':
        setMessages(prev => [...prev, {
          type: 'ai',
          content: data.aiResponse,
          timestamp: new Date(),
          isTimeout: true
        }]);
        break;



      case 'scene_reset':
        setMessages(prev => [...prev, {
          type: 'system',
          content: `🔄 ${data.message}`,
          timestamp: new Date()
        }]);

        // Add the new AI response after the reset
        if (data.aiResponse) {
          setMessages(prev => [...prev, {
            type: 'ai',
            content: data.aiResponse,
            timestamp: new Date(),
            diceResults: []
          }]);
        }

        // Update story data
        if (story) {
          setStory(prev => ({
            ...prev,
            stats: {
              ...prev.stats,
              totalInteractions: data.currentChapter
            },
            worldState: {
              ...prev.worldState,
              currentChapter: data.currentChapter
            }
          }));
        }
        break;

      case 'story_ended':
        setMessages(prev => [...prev, {
          type: 'system',
          content: `Story ended. Final stats: ${data.finalStats.totalInteractions} interactions.`,
          timestamp: new Date()
        }]);
        break;

      case 'error':
        setMessages(prev => [...prev, {
          type: 'system',
          content: `Error: ${data.message}`,
          timestamp: new Date()
        }]);
        break;

      default:
        setMessages(prev => [...prev, {
          type: 'system',
          content: `Unknown response type: ${data.type}`,
          timestamp: new Date()
        }]);
    }
  };

  const handleCommand = (command) => {
    setUserInput(command);
    inputRef.current?.focus();
  };

  const formatMessage = (message) => {
    const isUser = message.type === 'user';
    const isSystem = message.type === 'system';
    const isTimeout = message.isTimeout;

    return (
      <Box
        key={message.timestamp.getTime()}
        sx={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          mb: 2,
        }}
      >
        <Paper
          sx={{
            p: 2,
            maxWidth: { xs: '100%', md: '70%' },
            backgroundColor: isUser ? 'primary.main' : 'background.paper',
            color: isUser ? 'white' : 'text.primary',
            border: isTimeout ? 2 : 1,
            borderColor: isTimeout ? 'warning.main' : 'divider',
          }}
        >
          <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
            {message.content}
          </Typography>

          {message.diceResults && message.diceResults.length > 0 && (
            (() => {
              const d = message.diceResults[0];
              const situation = message.diceMeta?.situation
                ? message.diceMeta.situation.charAt(0).toUpperCase() + message.diceMeta.situation.slice(1)
                : null;
              const reason = message.diceMeta?.reason || '';
              const interpretation = d.interpretation || '';
              return (
                <Box sx={{ mt: 1.25, display: 'flex', alignItems: 'center', gap: 1.25 }} aria-label={`Dice roll d20 ${d.result}${situation ? ` for ${situation}` : ''}`}>
                  <CasinoIcon fontSize="small" sx={{ opacity: 0.8 }} />
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    d20: {d.result}
                  </Typography>
                  {situation && (
                    <Tooltip title={interpretation} arrow>
                      <Chip size="small" label={situation} variant="outlined" />
                    </Tooltip>
                  )}
                  {interpretation && !situation && (
                    <Typography variant="body2" color="text.secondary">
                      {interpretation}
                    </Typography>
                  )}
                  {reason && (
                    <Typography variant="caption" color="text.secondary">
                      • {reason}
                    </Typography>
                  )}
                </Box>
              );
            })()
          )}

          <Typography variant="caption" sx={{ display: 'block', mt: 1, opacity: 0.5 }}>
            {message.timestamp.toLocaleTimeString()}
          </Typography>
        </Paper>
      </Box>
    );
  };

  if (!story) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      {/* Story Header */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h5">{story.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {story.genre} • Chapter {story.worldState.currentChapter} • {story.status}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <ButtonGroup size={isMobile ? 'small' : 'medium'}>
              <Button variant="outlined" onClick={handleBookify} disabled={exporting}>
                {exporting ? 'Bookifying…' : 'Bookify (Free)'}
              </Button>
              <Button
                variant="contained"
                color="primary"
                onClick={async () => {
                if (!storyId || !token) return;
                setExporting(true);
                try {
                  const res = await fetch(`${API_URL}/export/stories/${storyId}/epub`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${token}`
                    }
                  });
                  if (!res.ok) throw new Error('EPUB export failed');
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  const safeTitle = (story.title || 'story').replace(/[^a-z0-9\-_]+/gi, '_');
                  a.href = url;
                  a.download = `${safeTitle}.epub`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch (e) {
                  setError(e.message || 'EPUB export failed');
                } finally {
                  setExporting(false);
                }
                }}
              >
                Export EPUB
              </Button>
            </ButtonGroup>
          </Box>
        </Box>
      </Box>

      {/* Commands Panel */}
      {showCommands && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            Available Commands
          </Typography>
          <Grid container spacing={1}>
            <Grid item>
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleCommand('/char')}
                startIcon={<PersonIcon />}
              >
                List Characters
              </Button>
            </Grid>
            <Grid item>
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleCommand('/info')}
                startIcon={<InfoIcon />}
              >
                Get Info
              </Button>
            </Grid>
            <Grid item>
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleCommand('/timeout')}
                startIcon={<PauseIcon />}
              >
                Timeout
              </Button>
            </Grid>
            <Grid item>

            </Grid>
            <Grid item>
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleCommand('/end')}
                color="error"
              >
                End Story
              </Button>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Messages */}
      <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 1.5, md: 2 } }} ref={containerRef} id="message-container">
        {messages.map(formatMessage)}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2 }}>
            <Paper sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                <Typography>AI is thinking...</Typography>
              </Box>
            </Paper>
          </Box>
        )}
        <div ref={endRef} />
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Input Form */}
      <Paper sx={{ p: { xs: 1, md: 2 }, position: { xs: 'sticky', md: 'static' }, bottom: 0, left: 0, right: 0 }}>
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', gap: 1 }}>
          <TextField
            fullWidth
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!loading && userInput.trim()) {
                  handleSubmit(e);
                }
              }
            }}
            placeholder="Type your action, choice, or command... (Enter to send, Shift+Enter for new line)"
            disabled={loading}
            inputRef={inputRef}
            multiline
            maxRows={4}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !userInput.trim()}
            startIcon={loading ? <CircularProgress size={20} /> : <SendIcon />}
          >
            Send
          </Button>
        </Box>
      </Paper>

      {/* Bookify Dialog */}
      <Dialog open={exportOpen} onClose={() => setExportOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{exportData?.title || 'Bookify'}</DialogTitle>
        <DialogContent dividers>
          {exporting && <LinearProgress sx={{ mb: 2 }} />}
          {exportError && <Alert severity="error" sx={{ mb: 2 }}>{exportError}</Alert>}
          {exportData && (
            <Typography component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
              {exportData.content}
            </Typography>
          )}
          {!exporting && !exportData && !exportError && (
            <Typography variant="body2" color="text.secondary">Preparing…</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportOpen(false)}>Close</Button>
          <Button onClick={handleDownloadTxt} disabled={!exportData} variant="contained">Download .txt</Button>
        </DialogActions>
      </Dialog>


    </Box>
  );
}

export default StoryPlay;