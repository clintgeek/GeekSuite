import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, TextField, Button, Paper, CircularProgress,
  Alert, Chip, IconButton, Tooltip, Divider, Dialog, DialogTitle,
  DialogContent, DialogActions, LinearProgress, alpha,
} from '@mui/material';
import { useTheme, useMediaQuery, ButtonGroup } from '@mui/material';
import {
  Send as SendIcon, Casino as CasinoIcon, MenuBook as ExportIcon,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import useSharedAuthStore from '../store/sharedAuthStore';
import useAISettingsStore from '../store/aiSettingsStore';
import api from '../api';

// Dice result color based on d20 roll
const getDiceColor = (result) => {
  if (result === 20) return '#ffd700';
  if (result === 1) return '#ff4444';
  if (result >= 15) return '#4caf50';
  if (result >= 10) return '#c9a84c';
  if (result >= 5) return '#ff9800';
  return '#e57373';
};

function StoryPlay() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { storyId } = useParams();
  const navigate = useNavigate();
  const { user } = useSharedAuthStore();
  const { selectedProvider, selectedModelId } = useAISettingsStore();
  const gold = theme.palette.codex?.gold || '#c9a84c';

  const [story, setStory] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportData, setExportData] = useState(null);
  const containerRef = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  useEffect(() => {
    scrollToBottom();
    if (inputRef.current) try { inputRef.current.focus(); } catch (_) {}
  }, [messages]);

  useEffect(() => {
    if (user && user.id) loadStory();
  }, [storyId, user]);

  const loadStory = async () => {
    try {
      if (!user || !user.id) { setError('Authentication required'); return; }
      const response = await api.get(`/stories/${storyId}`);
      const storyData = response.data;
      setStory(storyData);
      setMessages(storyData.events.map(event => ({
        type: 'ai', content: event.description,
        timestamp: new Date(event.timestamp),
        diceResults: event.diceResults || []
      })));
    } catch (err) {
      setError('Failed to load story');
      console.error('Error loading story:', err);
    }
  };

  const handleBookify = async () => {
    if (!storyId) return;
    setExporting(true); setExportError(''); setExportOpen(true);
    try {
      const res = await api.post(`/export/stories/${storyId}/bookify`);
      if (!res.data.success) throw new Error(res.data.error?.message || 'Bookify failed');
      setExportData(res.data.data);
    } catch (e) { setExportError(e.message || 'Bookify failed'); }
    finally { setExporting(false); }
  };

  const handleDownloadTxt = () => {
    if (!exportData) return;
    const blob = new Blob([exportData.content || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${(exportData.title || 'story').replace(/[^a-z0-9\-_]+/gi, '_')}.txt`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userInput.trim() || loading) return;
    const input = userInput.trim();
    setUserInput('');
    setMessages(prev => [...prev, { type: 'user', content: input, timestamp: new Date() }]);
    setLoading(true); setError('');

    try {
      const response = await api.post(`/stories/${storyId}/continue`, {
        userInput: input,
        provider: selectedProvider || 'gemini',
        model: selectedModelId || 'gemini-1.5-flash-latest'
      });
      const data = response.data;

      if (data.type) { handleSpecialResponse(data); return; }

      setMessages(prev => [...prev, {
        type: 'ai', content: data.aiResponse, timestamp: new Date(),
        diceResults: data.diceResult ? [data.diceResult] : [],
        diceMeta: data.diceMeta || null
      }]);
    } catch (err) {
      setError('Failed to continue story');
      console.error('Error continuing story:', err);
    } finally { setLoading(false); }
  };

  const handleSpecialResponse = (data) => {
    const systemMsg = (content) => setMessages(prev => [...prev, { type: 'system', content, timestamp: new Date() }]);
    switch (data.type) {
      case 'character_list':
        systemMsg(`Characters:\n${data.characters.map(c => `  ${c.name} — ${c.description}${c.isActive ? '' : ' (inactive)'}`).join('\n')}`);
        break;
      case 'character_info':
        systemMsg(`${data.character.name}\n${data.character.description}\n${data.character.personality ? `Personality: ${data.character.personality}` : ''}`);
        break;
      case 'checkpoint_created':
      case 'checkpoint_restored':
        systemMsg(data.message);
        if (data.type === 'checkpoint_restored') loadStory();
        break;
      case 'checkpoint_list':
        systemMsg(`Checkpoints:\n${data.checkpoints.map(cp => `  ${cp.description} — ${new Date(cp.timestamp).toLocaleString()}`).join('\n')}`);
        break;
      case 'scene_reset':
        systemMsg(data.message);
        if (data.aiResponse) setMessages(prev => [...prev, { type: 'ai', content: data.aiResponse, timestamp: new Date(), diceResults: [] }]);
        break;
      case 'story_ended':
        systemMsg('The tale has reached its end.');
        break;
      case 'error':
        systemMsg(data.message);
        break;
      default:
        systemMsg(`Response: ${JSON.stringify(data)}`);
    }
  };

  const renderMessage = (message, index) => {
    const isUser = message.type === 'user';
    const isSystem = message.type === 'system';

    return (
      <Box
        key={index}
        className="fade-in-up"
        sx={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          mb: 2.5,
          animationDelay: '0.05s',
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, md: 2.5 },
            maxWidth: isUser ? { xs: '85%', md: '50%' } : { xs: '100%', md: '80%' },
            borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            ...(isUser ? {
              background: `linear-gradient(135deg, ${alpha(gold, 0.15)} 0%, ${alpha(gold, 0.08)} 100%)`,
              border: `1px solid ${alpha(gold, 0.2)}`,
            } : isSystem ? {
              background: alpha(theme.palette.info.main, 0.06),
              border: `1px solid ${alpha(theme.palette.info.main, 0.15)}`,
              fontStyle: 'italic',
            } : {
              background: theme.palette.mode === 'dark'
                ? `linear-gradient(160deg, ${alpha('#2a2420', 0.8)} 0%, ${alpha('#1a1614', 0.6)} 100%)`
                : alpha(theme.palette.background.paper, 0.8),
              border: `1px solid ${theme.palette.divider}`,
            }),
          }}
        >
          {/* Narrator label for AI messages */}
          {!isUser && !isSystem && (
            <Typography variant="caption" sx={{
              color: gold, fontWeight: 600, display: 'block', mb: 0.75,
            }}>
              {'\u{270D}'} NARRATOR
            </Typography>
          )}
          {isSystem && (
            <Typography variant="caption" sx={{
              color: 'info.main', fontWeight: 600, display: 'block', mb: 0.75,
            }}>
              SYSTEM
            </Typography>
          )}

          <Typography variant="body1" sx={{
            whiteSpace: 'pre-wrap',
            lineHeight: 1.8,
            ...(isUser ? { fontWeight: 500 } : {}),
            ...(!isUser && !isSystem ? {
              fontFamily: '"Crimson Pro", serif',
              fontSize: '1.05rem',
            } : {}),
          }}>
            {message.content}
          </Typography>

          {/* Dice Result */}
          {message.diceResults?.length > 0 && (() => {
            const d = message.diceResults[0];
            const sit = message.diceMeta?.situation;
            const reason = message.diceMeta?.reason;
            const dColor = getDiceColor(d.result);
            const isCrit = d.result === 20 || d.result === 1;
            return (
              <Box sx={{
                mt: 1.5, p: 1.25, borderRadius: 2,
                background: alpha(dColor, 0.08),
                border: `1px solid ${alpha(dColor, 0.2)}`,
                display: 'flex', alignItems: 'center', gap: 1.5,
              }}>
                <Box sx={{
                  width: 40, height: 40, borderRadius: 1.5,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: alpha(dColor, 0.15),
                  border: `2px solid ${alpha(dColor, 0.4)}`,
                  ...(isCrit ? { animation: 'glowPulse 2s ease-in-out infinite' } : {}),
                }}>
                  <Typography sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontWeight: 700, fontSize: '1.1rem', color: dColor,
                  }}>
                    {d.result}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{ color: dColor, fontWeight: 700 }}>
                      D20 {isCrit ? (d.result === 20 ? '// CRITICAL' : '// FUMBLE') : ''}
                    </Typography>
                    {sit && (
                      <Chip size="small" label={sit.toUpperCase()}
                        sx={{
                          height: 20, fontSize: '0.6rem', fontWeight: 700,
                          backgroundColor: alpha(dColor, 0.12), color: dColor,
                          borderRadius: 1,
                        }}
                      />
                    )}
                  </Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', mt: 0.25 }}>
                    {d.interpretation}{reason ? ` — ${reason}` : ''}
                  </Typography>
                </Box>
              </Box>
            );
          })()}

          {/* Timestamp */}
          <Typography variant="caption" sx={{
            display: 'block', mt: 1, opacity: 0.35,
            fontSize: '0.65rem',
          }}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Typography>
        </Paper>
      </Box>
    );
  };

  if (!story) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress sx={{ color: gold }} />
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      {/* Story Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        mb: 2, pb: 1.5, borderBottom: `1px solid ${alpha(gold, 0.1)}`,
      }}>
        <Box>
          <Typography variant="h4" sx={{ lineHeight: 1.2 }}>{story.title}</Typography>
          <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {story.genre}
            </Typography>
            <Typography variant="caption" sx={{ color: alpha(gold, 0.4) }}>|</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {story.stats?.totalInteractions || 0} turns
            </Typography>
            <Typography variant="caption" sx={{ color: alpha(gold, 0.4) }}>|</Typography>
            <Chip label={story.status} size="small"
              sx={{ height: 20, fontSize: '0.6rem', textTransform: 'uppercase' }}
              color={story.status === 'active' ? 'success' : 'default'}
            />
          </Box>
        </Box>
        <ButtonGroup size="small" variant="outlined">
          <Button onClick={handleBookify} disabled={exporting} startIcon={<ExportIcon sx={{ fontSize: '16px !important' }} />}>
            {exporting ? 'Working...' : 'Bookify'}
          </Button>
          <Button onClick={async () => {
            if (!storyId) return;
            setExporting(true);
            try {
              const res = await api.post(`/export/stories/${storyId}/epub`, null, { responseType: 'blob' });
              const url = URL.createObjectURL(res.data);
              const a = document.createElement('a');
              a.href = url; a.download = `${(story.title || 'story').replace(/[^a-z0-9\-_]+/gi, '_')}.epub`;
              document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
            } catch (e) { setError(e.message || 'EPUB export failed'); }
            finally { setExporting(false); }
          }}>
            EPUB
          </Button>
        </ButtonGroup>
      </Box>

      {/* Messages */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1, overflow: 'auto',
          px: { xs: 0.5, md: 2 }, py: 2,
        }}
      >
        {messages.map(renderMessage)}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2 }}>
            <Paper sx={{
              p: 2, display: 'flex', alignItems: 'center', gap: 1.5,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '16px 16px 16px 4px',
            }}>
              <Box sx={{
                width: 8, height: 8, borderRadius: '50%',
                backgroundColor: gold, animation: 'glowPulse 1.5s ease-in-out infinite',
              }} />
              <Typography variant="body2" sx={{
                color: 'text.secondary', fontFamily: '"Cinzel", serif',
                fontSize: '0.8rem', letterSpacing: '0.05em',
              }}>
                The narrator contemplates...
              </Typography>
            </Paper>
          </Box>
        )}
        <div ref={endRef} />
      </Box>

      {/* Error */}
      {error && <Alert severity="error" sx={{ mb: 1, mx: 1 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Input */}
      <Paper sx={{
        p: { xs: 1.5, md: 2 },
        borderTop: `1px solid ${alpha(gold, 0.1)}`,
        borderRadius: 0,
        position: 'sticky', bottom: 0,
        background: theme.palette.mode === 'dark'
          ? alpha(theme.palette.background.default, 0.95)
          : alpha(theme.palette.background.paper, 0.95),
        backdropFilter: 'blur(8px)',
      }}>
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField
            fullWidth value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!loading && userInput.trim()) handleSubmit(e);
              }
            }}
            placeholder="What do you do?"
            disabled={loading} inputRef={inputRef}
            multiline maxRows={4}
            sx={{
              '& .MuiOutlinedInput-root': {
                fontFamily: '"Crimson Pro", serif',
                fontSize: '1rem',
              },
            }}
          />
          <Button
            type="submit" variant="contained"
            disabled={loading || !userInput.trim()}
            sx={{
              minWidth: 48, height: 48, borderRadius: 2, px: 0,
            }}
          >
            {loading ? <CircularProgress size={20} sx={{ color: 'inherit' }} /> : <SendIcon />}
          </Button>
        </Box>
        <Typography variant="body2" sx={{
          mt: 0.75, fontSize: '0.7rem', color: 'text.disabled', textAlign: 'center',
        }}>
          /checkpoint /back /char /info /end
        </Typography>
      </Paper>

      {/* Bookify Dialog */}
      <Dialog open={exportOpen} onClose={() => setExportOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontFamily: '"Cinzel", serif' }}>{exportData?.title || 'Bookify'}</DialogTitle>
        <DialogContent dividers>
          {exporting && <LinearProgress sx={{ mb: 2 }} />}
          {exportError && <Alert severity="error" sx={{ mb: 2 }}>{exportError}</Alert>}
          {exportData && (
            <Typography component="pre" sx={{
              whiteSpace: 'pre-wrap', fontFamily: '"Crimson Pro", serif',
              fontSize: '1.05rem', lineHeight: 1.8,
            }}>
              {exportData.content}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportOpen(false)} sx={{ color: 'text.secondary' }}>Close</Button>
          <Button onClick={handleDownloadTxt} disabled={!exportData} variant="contained">Download .txt</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StoryPlay;
