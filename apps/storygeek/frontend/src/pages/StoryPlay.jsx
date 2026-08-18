import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, TextField, Button, Paper, CircularProgress,
  Alert, Chip, IconButton, Tooltip, Divider, Dialog, DialogTitle,
  DialogContent, DialogActions, LinearProgress, Drawer, alpha,
} from '@mui/material';
import { useTheme, useMediaQuery, ButtonGroup } from '@mui/material';
import {
  Send as SendIcon, Casino as CasinoIcon, MenuBook as ExportIcon,
  AutoStories as JournalIcon, Person as PersonIcon, Groups as PartyIcon,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@geeksuite/auth';
import useAISettingsStore from '../store/aiSettingsStore';
import api from '../api';
import ScenePanel from '../components/panels/ScenePanel';
import CharacterPanel from '../components/panels/CharacterPanel';
import PartyPanel from '../components/panels/PartyPanel';
import QuestPanel from '../components/panels/QuestPanel';
import JournalDrawer from '../components/panels/JournalDrawer';
import {
  getPlayer, getPresentNpcs, getActiveThreads, getScene,
} from '../game/projections';

// Map a persisted story event to a chat message. Player "dialogue" events are
// stored as "Player: <input>"; render them as the player's own bubble on
// reload instead of narrator text.
const eventToMessage = (event) => {
  const isPlayerLine = event.type === 'dialogue' && /^player:/i.test(event.description || '');
  return {
    type: isPlayerLine ? 'user' : 'ai',
    content: isPlayerLine ? event.description.replace(/^player:\s*/i, '') : event.description,
    timestamp: new Date(event.timestamp),
    diceResults: event.diceResults || [],
  };
};

// Provenance badge styling for canon facts: who established it, and when.
const PROVENANCE_META = {
  player:   { label: 'YOU',      color: '#4caf50' },
  narrator: { label: 'NARRATOR', color: '#c9a84c' },
  setup:    { label: 'OPENING',  color: '#7986cb' },
};

/**
 * CanonCard — the answer to "what do we know?" straight from the engine's
 * record. The fact list with provenance badges IS the answer; the summary
 * prose on top is generated under a report-only contract. Distinct visual
 * identity from narration: this is the archive speaking, not the narrator.
 */
function CanonCard({ canon, gold, theme }) {
  return (
    <Box className="fade-in-up" sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2.5 }}>
      <Paper elevation={0} sx={{
        p: { xs: 2, md: 2.5 }, maxWidth: { xs: '100%', md: '85%' }, width: '100%',
        borderRadius: 2,
        border: `1px solid ${alpha(gold, 0.35)}`,
        borderLeft: `4px solid ${gold}`,
        background: alpha(gold, 0.04),
      }}>
        <Typography variant="caption" sx={{ color: gold, fontWeight: 700, display: 'block', mb: 0.75, letterSpacing: '0.08em' }}>
          📜 CANON — from the record
        </Typography>

        {canon.summary && (
          <Typography variant="body2" sx={{ mb: 1.5, lineHeight: 1.7, fontSize: '0.9rem' }}>
            {canon.summary}
          </Typography>
        )}

        {canon.entities?.length > 0 && (
          <Box sx={{ mb: 1.25 }}>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {canon.entities.map((e, i) => (
                <Chip key={i} size="small" variant="outlined"
                  label={e.kind === 'character'
                    ? `${e.name} · ${e.status}${e.locationName ? ` · at ${e.locationName}` : ''}`
                    : `${e.name} · ${e.state}`}
                  sx={{ borderColor: alpha(gold, 0.4), color: 'text.primary', fontSize: '0.7rem' }} />
              ))}
            </Box>
            {/* What each character is recorded as knowing (player-visible only) */}
            {canon.entities.filter(e => e.knows?.length > 0).map((e, i) => (
              <Box key={`k${i}`} sx={{ mt: 0.75, pl: 1, borderLeft: `2px solid ${alpha(gold, 0.25)}` }}>
                <Typography variant="caption" sx={{ color: alpha(gold, 0.7), fontSize: '0.62rem', fontWeight: 700 }}>
                  {e.name.toUpperCase()} KNOWS (as recorded)
                </Typography>
                {e.knows.map((k, j) => (
                  <Typography key={j} variant="body2" sx={{ fontSize: '0.78rem', color: 'text.secondary', lineHeight: 1.5 }}>
                    • {k.text} <Typography component="span" sx={{ fontSize: '0.6rem', color: 'text.disabled', fontFamily: '"JetBrains Mono", monospace' }}>
                      [{k.via}{k.turn != null ? ` · T${k.turn}` : ''}]
                    </Typography>
                  </Typography>
                ))}
              </Box>
            ))}
          </Box>
        )}

        {canon.facts?.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 1 }}>
            {canon.facts.map((f, i) => {
              const prov = PROVENANCE_META[f.source] || { label: 'RECORD', color: theme.palette.text.disabled };
              return (
                <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Chip size="small"
                    label={`${prov.label}${f.turn != null ? ` · T${f.turn}` : ''}`}
                    sx={{
                      height: 18, fontSize: '0.55rem', fontWeight: 700, flexShrink: 0, mt: 0.2,
                      backgroundColor: alpha(prov.color, 0.12), color: prov.color,
                      fontFamily: '"JetBrains Mono", monospace',
                    }} />
                  <Typography variant="body2" sx={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                    {f.text}
                    {f.visibility === 'secret' && (
                      <Chip size="small" label="secret" color="warning" variant="outlined"
                        sx={{ ml: 0.5, height: 14, fontSize: '0.5rem', textTransform: 'uppercase' }} />
                    )}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}

        {canon.threads?.length > 0 && (
          <Box sx={{ mb: 1 }}>
            {canon.threads.map((t, i) => (
              <Typography key={i} variant="body2" sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                ◈ <b>{t.name}</b> [{t.status}] — {t.description}
              </Typography>
            ))}
          </Box>
        )}

        <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic', fontSize: '0.68rem' }}>
          {canon.note}
        </Typography>
      </Paper>
    </Box>
  );
}

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
  const { user } = useAuth();
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
  const [journalOpen, setJournalOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(null); // 'left' | 'right' | null
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
      setMessages(storyData.events.map(eventToMessage));
    } catch (err) {
      setError('Failed to load story');
      console.error('Error loading story:', err);
    }
  };

  // Refresh only the canonical story (feeds the panels) without rebuilding
  // the message stream — called after each turn so the HUD/scene/party/
  // quests/journal stay in sync with the engine as play advances.
  const refreshStory = async () => {
    try {
      const response = await api.get(`/stories/${storyId}`);
      setStory(response.data);
    } catch (err) {
      console.warn('Story refresh failed (panels may lag one turn):', err.message);
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
      // Only send provider/model when the user explicitly picked one —
      // otherwise the backend's pinned GM model is used.
      const response = await api.post(`/stories/${storyId}/continue`, {
        userInput: input,
        ...(selectedProvider && selectedModelId
          ? { provider: selectedProvider, model: selectedModelId }
          : {})
      });
      const data = response.data;

      if (data.type) { handleSpecialResponse(data); return; }

      setMessages(prev => [...prev, {
        type: 'ai', content: data.aiResponse, timestamp: new Date(),
        diceResults: data.diceResult ? [data.diceResult] : [],
        diceMeta: data.diceMeta || null
      }]);
      // Pull the freshly-committed canonical state so the panels reflect this
      // turn's changes (new NPCs, location, threads, facts, scene, …).
      refreshStory();
    } catch (err) {
      setError('Failed to continue story');
      console.error('Error continuing story:', err);
    } finally { setLoading(false); }
  };

  const handleSpecialResponse = (data) => {
    const systemMsg = (content) => setMessages(prev => [...prev, { type: 'system', content, timestamp: new Date() }]);
    switch (data.type) {
      case 'canon_answer':
        // Answered from the record, not the narrator — rendered as a CANON
        // card with per-fact provenance. Zero-turn: the world didn't advance.
        setMessages(prev => [...prev, { type: 'canon', canon: data, timestamp: new Date() }]);
        break;
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

    if (message.type === 'canon') {
      return <CanonCard key={index} canon={message.canon} gold={gold} theme={theme} />;
    }

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

  // ── Canonical projections for the game panels ──────────────────────
  const player = getPlayer(story);
  const npcs = getPresentNpcs(story);
  const threads = getActiveThreads(story);
  const scene = getScene(story);

  const leftRail = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <ScenePanel scene={scene} />
      <CharacterPanel player={player} />
    </Box>
  );
  const rightRail = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <PartyPanel npcs={npcs} player={player} story={story} />
      <QuestPanel threads={threads} />
    </Box>
  );

  const centerColumn = (
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 1, mb: 1.5, pb: 1.25, borderBottom: `1px solid ${alpha(gold, 0.1)}`,
      }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {story.title}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.25, alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{story.genre}</Typography>
            <Typography variant="caption" sx={{ color: alpha(gold, 0.4) }}>·</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Turn {scene.turn}</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
          {isMobile && (
            <>
              <IconButton size="small" onClick={() => setMobilePanel('left')} sx={{ color: 'text.secondary' }}>
                <PersonIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={() => setMobilePanel('right')} sx={{ color: 'text.secondary' }}>
                <PartyIcon fontSize="small" />
              </IconButton>
            </>
          )}
          <Tooltip title="Journal — what your character knows">
            <IconButton size="small" onClick={() => setJournalOpen(true)} sx={{ color: gold }}>
              <JournalIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <ButtonGroup size="small" variant="outlined">
            <Button onClick={handleBookify} disabled={exporting} startIcon={<ExportIcon sx={{ fontSize: '16px !important' }} />}>
              {exporting ? '...' : 'Bookify'}
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
            }}>EPUB</Button>
          </ButtonGroup>
        </Box>
      </Box>

      {/* Messages */}
      <Box ref={containerRef} sx={{ flex: 1, overflow: 'auto', px: { xs: 0.5, md: 1.5 }, py: 1 }}>
        {messages.map(renderMessage)}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2 }}>
            <Paper sx={{
              p: 2, display: 'flex', alignItems: 'center', gap: 1.5,
              border: `1px solid ${theme.palette.divider}`, borderRadius: '16px 16px 16px 4px',
            }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: gold, animation: 'glowPulse 1.5s ease-in-out infinite' }} />
              <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: '"Cinzel", serif', fontSize: '0.8rem', letterSpacing: '0.05em' }}>
                The narrator contemplates...
              </Typography>
            </Paper>
          </Box>
        )}
        <div ref={endRef} />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 1, mx: 1 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Input */}
      <Paper sx={{
        p: { xs: 1.5, md: 2 }, borderTop: `1px solid ${alpha(gold, 0.1)}`, borderRadius: 0,
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
            sx={{ '& .MuiOutlinedInput-root': { fontFamily: '"Crimson Pro", serif', fontSize: '1rem' } }}
          />
          <Button type="submit" variant="contained" disabled={loading || !userInput.trim()}
            sx={{ minWidth: 48, height: 48, borderRadius: 2, px: 0 }}>
            {loading ? <CircularProgress size={20} sx={{ color: 'inherit' }} /> : <SendIcon />}
          </Button>
        </Box>
        <Typography variant="body2" sx={{ mt: 0.75, fontSize: '0.7rem', color: 'text.disabled', textAlign: 'center' }}>
          /recall /checkpoint /back /char /info /end
        </Typography>
      </Paper>
    </Box>
  );

  return (
    <Box sx={{ height: 'calc(100vh - 120px)', display: 'flex', gap: 1.5, minHeight: 0 }}>
      {/* Left rail (desktop) */}
      {!isMobile && (
        <Box sx={{ width: 272, flexShrink: 0, overflowY: 'auto', pr: 0.5 }}>
          {leftRail}
        </Box>
      )}

      {/* Center */}
      <Box sx={{ flex: 1, minWidth: 0 }}>{centerColumn}</Box>

      {/* Right rail (desktop) */}
      {!isMobile && (
        <Box sx={{ width: 300, flexShrink: 0, overflowY: 'auto', pl: 0.5 }}>
          {rightRail}
        </Box>
      )}

      {/* Mobile panel drawers */}
      <Drawer anchor="left" open={mobilePanel === 'left'} onClose={() => setMobilePanel(null)}
        PaperProps={{ sx: { width: '85%', maxWidth: 320, p: 1.5 } }}>
        {leftRail}
      </Drawer>
      <Drawer anchor="right" open={mobilePanel === 'right'} onClose={() => setMobilePanel(null)}
        PaperProps={{ sx: { width: '85%', maxWidth: 340, p: 1.5 } }}>
        {rightRail}
      </Drawer>

      {/* Journal */}
      <JournalDrawer open={journalOpen} onClose={() => setJournalOpen(false)} story={story} />

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
