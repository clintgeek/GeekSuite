import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, TextField, Button, Paper, CircularProgress,
  Alert, Chip, IconButton, Tooltip, LinearProgress, alpha,
} from '@mui/material';
import { useTheme, useMediaQuery, ButtonGroup } from '@mui/material';
import {
  Send as SendIcon, MenuBook as ExportIcon, ContentCopy as CopyIcon,
  IosShare as ShareIcon, Download as DownloadIcon,
  AutoStories as JournalIcon, Person as PersonIcon, Groups as PartyIcon,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@geeksuite/auth';
import { GeekSheet } from '@geeksuite/ui';
import CodexDialog from '../components/primitives/CodexDialog';
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
// `tone: 'gold'` resolves to the theme's mode-aware gold at render time.
const PROVENANCE_META = {
  player:   { label: 'YOU',      color: '#4caf50' },
  narrator: { label: 'NARRATOR', tone: 'gold' },
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
                  sx={{ borderColor: alpha(gold, 0.4), color: 'text.primary' }} />
              ))}
            </Box>
            {/* What each character is recorded as knowing (player-visible only) */}
            {canon.entities.filter(e => e.knows?.length > 0).map((e, i) => (
              <Box key={`k${i}`} sx={{ mt: 0.75, pl: 1, borderLeft: `2px solid ${alpha(gold, 0.25)}` }}>
                <Typography variant="caption" sx={{ color: alpha(gold, 0.7), fontWeight: 700 }}>
                  {e.name.toUpperCase()} KNOWS (as recorded)
                </Typography>
                {e.knows.map((k, j) => (
                  <Typography key={j} variant="body2" sx={{ fontSize: '0.78rem', color: 'text.secondary', lineHeight: 1.5 }}>
                    • {k.text} <Typography component="span" sx={{ fontSize: '0.75rem', color: 'text.disabled', fontFamily: '"JetBrains Mono", monospace' }}>
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
              const meta = PROVENANCE_META[f.source];
              const prov = meta
                ? { label: meta.label, color: meta.tone === 'gold' ? gold : meta.color }
                : { label: 'RECORD', color: theme.palette.text.disabled };
              return (
                <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Chip size="small"
                    label={`${prov.label}${f.turn != null ? ` · T${f.turn}` : ''}`}
                    sx={{
                      fontWeight: 700, flexShrink: 0, mt: 0.1,
                      backgroundColor: alpha(prov.color, 0.12), color: prov.color,
                      fontFamily: '"JetBrains Mono", monospace',
                    }} />
                  <Typography variant="body2" sx={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                    {f.text}
                    {f.visibility === 'secret' && (
                      <Chip size="small" label="secret" color="warning" variant="outlined"
                        sx={{ ml: 0.5, textTransform: 'uppercase' }} />
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

        <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
          {canon.note}
        </Typography>
      </Paper>
    </Box>
  );
}

// Dice result color based on d20 roll. Light mode gets deeper tones so the
// result text stays legible on parchment.
const getDiceColor = (result, isDark, gold) => {
  if (result === 20) return isDark ? '#ffd700' : '#8a6d00';
  if (result === 1) return isDark ? '#ff4444' : '#c62828';
  if (result >= 15) return isDark ? '#4caf50' : '#2e7d32';
  if (result >= 10) return gold;
  if (result >= 5) return isDark ? '#ff9800' : '#b45309';
  return isDark ? '#e57373' : '#b71c1c';
};

function StoryPlay() {
  const theme = useTheme();
  // Each rail collapses to a sheet at the width where it stops fitting, and its
  // toggle appears at exactly that width — so there is no band where a panel is
  // both absent and unreachable. That band is what the audit found
  // (MOBILE_UI_PLAN.md §4): both rails were gated on `lg` while the shell
  // switched at `md`, so 900–1200px got desktop chrome with no rails.
  //
  // Gating both on `md` instead — the literal fix — is worse, not better: at
  // 1000px the 220px nav, a 272px rail and a 300px rail leave the play column
  // about 180px wide (verified in the harness). So the left rail (scene +
  // character, the persistent HUD) returns at `md` and the right rail (party +
  // threads, situational) at `lg`, and the play column never drops below ~350px.
  const showLeftRail = useMediaQuery(theme.breakpoints.up('md'));
  const showRightRail = useMediaQuery(theme.breakpoints.up('lg'));
  const { storyId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedProvider, selectedModelId } = useAISettingsStore();
  const gold = theme.palette.codex?.gold || '#c9a84c';
  const isDark = theme.palette.mode === 'dark';

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
  const [copied, setCopied] = useState(false);
  const containerRef = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  // Refocusing the composer is an answer to the player's own send, not to the
  // narrator's reply. Autofocusing on every message re-opened the phone
  // keyboard mid-narration and shoved the story off screen
  // (MOBILE_UI_PLAN.md §2, "autofocus only on explicit user intent").
  const refocusRef = useRef(false);

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  useEffect(() => {
    scrollToBottom();
    if (!refocusRef.current) return;
    refocusRef.current = false;
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

  const handleCopyStory = async () => {
    if (!exportData?.content) return;
    try {
      await navigator.clipboard.writeText(exportData.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { setExportError('Could not copy to the clipboard'); }
  };

  // Only offered where the platform actually has a share sheet — every phone,
  // almost no desktop browser.
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const handleShareStory = async () => {
    if (!exportData?.content) return;
    try {
      await navigator.share({ title: exportData.title || 'A tale', text: exportData.content });
    } catch (e) { /* the user dismissed the share sheet */ }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userInput.trim() || loading) return;
    const input = userInput.trim();
    setUserInput('');
    refocusRef.current = true;
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
            const dColor = getDiceColor(d.result, isDark, gold);
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
                          fontWeight: 700,
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
            display: 'block', mt: 1, opacity: 0.6,
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
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, minHeight: 0 }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', flexShrink: 0,
        gap: 1, mb: 1.5, pb: 1.25, borderBottom: `1px solid ${alpha(gold, 0.1)}`,
      }}>
        <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
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
          {!showLeftRail && (
            <Tooltip title="Scene & character">
              <IconButton
                aria-label="Scene and character"
                onClick={() => setMobilePanel('left')}
                sx={{ color: 'text.secondary' }}
              >
                <PersonIcon />
              </IconButton>
            </Tooltip>
          )}
          {!showRightRail && (
            <Tooltip title="Party & threads">
              <IconButton
                aria-label="Party and threads"
                onClick={() => setMobilePanel('right')}
                sx={{ color: 'text.secondary' }}
              >
                <PartyIcon />
              </IconButton>
            </Tooltip>
          )}
          {/* The tooltip is the desktop nicety; the aria-label is the label a
              touch user's screen reader gets, and the sheet says "Journal" in
              its own heading. A tooltip is never the only label. */}
          <Tooltip title="Journal — what your character knows">
            <IconButton aria-label="Journal" onClick={() => setJournalOpen(true)} sx={{ color: gold }}>
              <JournalIcon />
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
      <Box ref={containerRef} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: { xs: 0.5, md: 1.5 }, py: 1 }}>
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

      {/* Input — the thumb-zone primary action. Pinned to the bottom of the
          frame (the column is a flex box, this row does not shrink) and padded
          clear of the iOS home indicator, so no FAB is needed here. */}
      <Paper sx={{
        flexShrink: 0,
        p: { xs: 1.5, md: 2 },
        pb: { xs: 'calc(12px + env(safe-area-inset-bottom))', md: 2 },
        borderTop: `1px solid ${alpha(gold, 0.1)}`, borderRadius: 0,
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
        <Typography variant="body2" sx={{ mt: 0.75, fontSize: '0.75rem', color: 'text.disabled', textAlign: 'center' }}>
          /recall /checkpoint /back /char /info /end
        </Typography>
      </Paper>
    </Box>
  );

  return (
    // The frame, not a guess at it. This used to be `calc(100vh - 120px)` with
    // a hardcoded 120 that matched neither the 60px top bar nor the container
    // padding — too short on desktop, too tall on a phone with the URL bar
    // showing. The shell already hands the route a correctly-sized box (dvh,
    // top bar and safe areas subtracted); the play surface just fills it.
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 1.5 }}>
      {/* Left rail — back at `md` */}
      {showLeftRail && (
        <Box sx={{ width: { md: 244, lg: 272 }, flexShrink: 0, overflowY: 'auto', pr: 0.5 }}>
          {leftRail}
        </Box>
      )}

      {/* Center */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>{centerColumn}</Box>

      {/* Right rail — back at `lg`, where there is room for both */}
      {showRightRail && (
        <Box sx={{ width: 300, flexShrink: 0, overflowY: 'auto', pl: 0.5 }}>
          {rightRail}
        </Box>
      )}

      {/* A collapsed rail is a `GeekSheet`, not an 85%-wide side drawer: one
          surface for every picker in the suite. Below `md` it slides up from
          the bottom with a grab handle and the safe-area inset; at `md`+ (the
          right rail between 900 and 1200px) the same component renders as a
          centred dialog. Same panels either way. */}
      <GeekSheet
        open={mobilePanel === 'left'}
        onClose={() => setMobilePanel(null)}
        title="Scene & Character"
        snap="full"
        bodySx={{ px: 1.5 }}
      >
        {leftRail}
      </GeekSheet>
      <GeekSheet
        open={mobilePanel === 'right'}
        onClose={() => setMobilePanel(null)}
        title="Party & Threads"
        snap="full"
        bodySx={{ px: 1.5 }}
      >
        {rightRail}
      </GeekSheet>

      {/* Journal */}
      <JournalDrawer open={journalOpen} onClose={() => setJournalOpen(false)} story={story} />

      {/* Bookify: a whole story in one scrolling body. Full-screen below `sm`
          via CodexDialog, with Copy as the header action — the phone's answer
          to "Download .txt", which a mobile browser has nowhere useful to put. */}
      <CodexDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        maxWidth="md"
        title={exportData?.title || 'Bookify'}
        primaryAction={
          <Button
            onClick={handleCopyStory}
            disabled={!exportData}
            variant="contained"
            startIcon={<CopyIcon />}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        }
        keepSecondaryOnMobile
        secondaryAction={
          <>
            {canShare && (
              <Button onClick={handleShareStory} disabled={!exportData} startIcon={<ShareIcon />}>
                Share
              </Button>
            )}
            <Button onClick={handleDownloadTxt} disabled={!exportData} startIcon={<DownloadIcon />}>
              Download .txt
            </Button>
          </>
        }
        bodySx={{ overflowY: 'auto' }}
      >
        {exporting && <LinearProgress sx={{ mb: 2 }} />}
        {exportError && <Alert severity="error" sx={{ mb: 2 }}>{exportError}</Alert>}
        {exportData && (
          <Typography component="pre" sx={{
            whiteSpace: 'pre-wrap', fontFamily: '"Crimson Pro", serif',
            fontSize: '1.05rem', lineHeight: 1.8, m: 0,
          }}>
            {exportData.content}
          </Typography>
        )}
      </CodexDialog>
    </Box>
  );
}

export default StoryPlay;
