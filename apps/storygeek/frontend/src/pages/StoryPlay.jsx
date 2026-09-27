import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, CircularProgress, IconButton, Tooltip, LinearProgress,
  alpha, useTheme, useMediaQuery,
} from '@mui/material';
import {
  MenuBook as ExportIcon, ContentCopy as CopyIcon,
  IosShare as ShareIcon, Download as DownloadIcon,
  HistoryEdu as JournalIcon, Groups as PartyIcon, ArrowBack as BackIcon,
  Place as PlaceIcon, FileDownloadOutlined as EpubIcon,
} from '@mui/icons-material';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useAuth } from '@geeksuite/auth';
import { GeekErrorState, GeekSheet, useToast } from '@geeksuite/ui';
import CodexDialog from '../components/primitives/CodexDialog';
import Narration from '../components/Narration';
import useAISettingsStore from '../store/aiSettingsStore';
import api, { LONG_REQUEST_TIMEOUT_MS, messageFromBlobError } from '../api';
import ScenePanel from '../components/panels/ScenePanel';
import CharacterPanel from '../components/panels/CharacterPanel';
import PartyPanel from '../components/panels/PartyPanel';
import QuestPanel from '../components/panels/QuestPanel';
import JournalDrawer from '../components/panels/JournalDrawer';
import CanonCard from '../components/play/CanonCard';
import Composer from '../components/play/Composer';
import WritingIndicator from '../components/play/WritingIndicator';
import { NarrationEntry, PlayerEntry, SystemEntry } from '../components/play/TranscriptEntry';
import { opensScene } from '../game/transcript';
import { fonts } from '../theme/theme';
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
  // Worded tools only where the play column can afford them; below `xl`
  // (both rails open at 1280) they are 44px icons so the title keeps its room.
  const wordedTools = useMediaQuery(theme.breakpoints.up('xl'));
  const { storyId } = useParams();
  const { user } = useAuth();
  const { notify } = useToast();
  const { selectedProvider, selectedModelId } = useAISettingsStore();
  const c = theme.palette.candle;
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const [story, setStory] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  // `loadError` gates the whole play surface (nothing else can render until
  // the story loads) — a real GeekErrorState with retry, not a toast. Every
  // other failure below is transient and fire-and-forget.
  const [loadError, setLoadError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportData, setExportData] = useState(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(null); // 'left' | 'right' | null
  const containerRef = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  // Refocusing the composer is an answer to the player's own send, not to the
  // narrator's reply. Autofocusing on every message re-opened the phone
  // keyboard mid-narration and shoved the story off screen
  // (MOBILE_UI_PLAN.md §2, "autofocus only on explicit user intent").
  const refocusRef = useRef(false);
  const lastEntryRef = useRef(null);
  const prevCountRef = useRef(0);

  // A fresh reply lands at the top of the view, so a long narration is read
  // from its first line instead of from wherever the bottom of it fell. The
  // first load, the player's own line and the writing mark still go to the
  // end of the page.
  useEffect(() => {
    const scrollIntoView = (el, block) => {
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block });
      }
    };
    const grewBy = messages.length - prevCountRef.current;
    const last = messages[messages.length - 1];
    const freshReply = prevCountRef.current > 0 && grewBy > 0 && last && last.type !== 'user';
    prevCountRef.current = messages.length;
    if (freshReply) scrollIntoView(lastEntryRef.current, 'start');
    else scrollIntoView(endRef.current, 'end');
    if (!refocusRef.current) return;
    refocusRef.current = false;
    if (inputRef.current) try { inputRef.current.focus(); } catch (_) {}
  }, [messages, reduceMotion]);

  // Keyed on the user's *id*, never on the `user` object: `loadStory` ends with
  // `setMessages(...map(...))`, which is a fresh array on every call, so the
  // component always re-renders after a load. If the effect also re-fired on a
  // new `user` reference, that re-render would trigger another load, forever.
  // The real AuthProvider memoises its context value so the reference is
  // stable, which is why production never span — but the loop is one identity
  // change away, and it pinned vitest/jsdom solid (see DOCS/CONTEXT.md).
  // Switching stories on a mounted StoryPlay (a hand-edited URL, a
  // back/forward between two /play entries) used to leave the previous
  // tale's title, transcript and panels on screen until the new fetch
  // landed — the `if (!story)` guard below passes while `story` is stale.
  useEffect(() => {
    setStory(null);
    prevCountRef.current = 0;
    setMessages([]);
    setExportData(null);
    setExportError('');
    setLoadError('');
  }, [storyId]);

  useEffect(() => {
    if (user?.id) loadStory();
  }, [storyId, user?.id]);

  const loadStory = async () => {
    try {
      if (!user || !user.id) { setLoadError('Authentication required'); return; }
      setLoadError('');
      const response = await api.get(`/stories/${storyId}`);
      const storyData = response.data;
      setStory(storyData);
      setMessages(storyData.events.map(eventToMessage));
    } catch (err) {
      setLoadError(err.message || 'Failed to load story');
      console.error('Error loading story:', err);
      // A reload triggered mid-play (a /back checkpoint restore) renders no
      // loadError — the `if (!story)` branch that shows it is long past — so
      // the player would keep reading the pre-restore transcript as if the
      // restore had done nothing. Say so where they are looking.
      if (story) notify('Could not reload the story — refresh the page', { tone: 'error' });
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
    // Clear the last export first: without this the dialog shows the previous
    // story text under the new progress bar, with Copy/Share/Download live.
    setExporting(true); setExportError(''); setExportData(null); setExportOpen(true);
    try {
      const res = await api.post(`/export/stories/${storyId}/bookify`, null, {
        timeout: LONG_REQUEST_TIMEOUT_MS,
      });
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
    document.body.appendChild(a); a.click(); a.remove();
    // Revoking in the same task can cancel the download in Firefox/Safari.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleCopyStory = async () => {
    if (!exportData?.content) return;
    try {
      await navigator.clipboard.writeText(exportData.content);
      notify('Copied to clipboard', { tone: 'success' });
    } catch (e) { notify('Could not copy to the clipboard', { tone: 'error' }); }
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
    setLoading(true);

    try {
      // Only send provider/model when the player pinned one in Settings —
      // otherwise this is Automatic, and aiGeek's sticky pick for this story
      // keeps the Game Master's voice consistent on its own.
      const response = await api.post(`/stories/${storyId}/continue`, {
        userInput: input,
        ...(selectedProvider && selectedModelId
          ? { provider: selectedProvider, model: selectedModelId }
          : {})
      // A turn legitimately chains two 45s GM calls plus a 45s extraction, so
      // this one needs far more than the client default.
      }, { timeout: LONG_REQUEST_TIMEOUT_MS });
      const data = response.data;

      // The narrator could not serve this turn. The backend answers **200**
      // with its own words and saved nothing — no event, no turn increment —
      // so take the phantom user bubble back and hand the player their words
      // instead of making them retype. Same treatment as the catch below,
      // because the outcome is the same; only the transport differs.
      if (data.type === 'ai_unavailable') {
        setMessages(prev => (
          prev.length > 0 && prev[prev.length - 1].type === 'user'
            ? prev.slice(0, -1)
            : prev
        ));
        setUserInput((current) => (current ? current : input));
        setMessages(prev => [...prev, {
          type: 'system',
          content: data.message || 'The narrator is not answering right now. Nothing was lost — try again.',
          timestamp: new Date()
        }]);
        return;
      }

      if (data.type) { handleSpecialResponse(data); return; }

      // A pin the Oracle could not honour: the turn happened on the automatic
      // pick, and the player is told once rather than left wondering why the
      // voice changed.
      if (data.notice) {
        setMessages(prev => [...prev, { type: 'system', content: data.notice, timestamp: new Date() }]);
      }

      setMessages(prev => [...prev, {
        type: 'ai', content: data.aiResponse, timestamp: new Date(),
        diceResults: data.diceResult ? [data.diceResult] : [],
        diceMeta: data.diceMeta || null
      }]);
      // Pull the freshly-committed canonical state so the panels reflect this
      // turn's changes (new NPCs, location, threads, facts, scene, …).
      refreshStory();
    } catch (err) {
      // The backend only persists the player's event alongside the AI's, at
      // the end of the turn — so on a failure nothing was saved and the
      // bubble on screen is a phantom that vanishes on the next reload. Take
      // it back and hand the player their words instead of making them retype.
      setMessages(prev => (
        prev.length > 0 && prev[prev.length - 1].type === 'user'
          ? prev.slice(0, -1)
          : prev
      ));
      setUserInput((current) => (current ? current : input));
      notify(err.message || 'Failed to continue story', { tone: 'error' });
      console.error('Error continuing story:', err);
      // The mirror case: a client timeout on a turn the server actually
      // completed. Re-reading the story reconciles the transcript instead of
      // leaving the UI one turn behind the record.
      refreshStory();
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
        // The controller already filters to the active cast and does not send
        // `isActive`, so the old ternary labelled every single one "(inactive)".
        systemMsg(`Characters:\n${data.characters.map(c => `  ${c.name} — ${c.description}`).join('\n')}`);
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
        if (data.notice) systemMsg(data.notice);
        if (data.aiResponse) setMessages(prev => [...prev, { type: 'ai', content: data.aiResponse, timestamp: new Date(), diceResults: [], opensScene: true }]);
        break;
      case 'story_ended':
        systemMsg('The tale has reached its end.');
        break;
      case 'location_info': {
        const loc = data.location || {};
        systemMsg([loc.name, loc.description, loc.atmosphere].filter(Boolean).join('\n'));
        break;
      }
      case 'timeout':
      case 'error':
        systemMsg(data.message);
        break;
      default:
        // Never dump a raw payload into the transcript: `/info <place>` and
        // `/timeout` both used to land here and print their JSON at the player.
        console.warn('Unhandled special response type:', data.type, data);
        systemMsg('The narrator did not understand that.');
    }
  };

  const renderMessage = (message, index, all, playerName) => {
    let entry;
    if (message.type === 'canon') entry = <CanonCard canon={message.canon} />;
    else if (message.type === 'user') entry = <PlayerEntry message={message} playerName={playerName} />;
    else if (message.type === 'system') entry = <SystemEntry message={message} />;
    else {
      entry = (
        <NarrationEntry
          message={message}
          opensScene={opensScene(all, index)}
          isFirst={!all.slice(0, index).some((m) => m.type === 'ai')}
        />
      );
    }
    return (
      <Box key={index} ref={index === all.length - 1 ? lastEntryRef : undefined} sx={{ scrollMarginTop: 16 }}>
        {entry}
      </Box>
    );
  };

  if (!story) {
    if (loadError) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', px: 2 }}>
          <GeekErrorState error={loadError} onRetry={loadStory} title="The tale would not open" />
        </Box>
      );
    }
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress aria-label="Opening the tale" />
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

  const handleEpub = async () => {
    if (!storyId) return;
    setExporting(true);
    try {
      const res = await api.post(`/export/stories/${storyId}/epub`, null, {
        responseType: 'blob',
        timeout: LONG_REQUEST_TIMEOUT_MS,
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `${(story.title || 'story').replace(/[^a-z0-9\-_]+/gi, '_')}.epub`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      // A blob responseType means the error body is a Blob, so the
      // shared interceptor can't read the envelope — unwrap it here.
      notify(await messageFromBlobError(e, 'EPUB export failed'), { tone: 'error' });
    }
    finally { setExporting(false); }
  };

  const toolSx = {
    width: 44, height: 44, borderRadius: '10px', color: 'text.secondary',
    '@media (hover: hover)': { '&:hover': { color: c.accent, backgroundColor: alpha(c.accent, 0.08) } },
  };
  const subline = [
    story.genre,
    `Turn ${scene.turn}`,
    scene.storyDay ? `Day ${scene.storyDay}` : null,
  ].filter(Boolean).join('  ·  ');

  // Party / Journal / Bookify / EPUB. Below `md` they are icon tools on the
  // scene strip; at `md`+ Journal and the two exports carry their words.
  // `disabled={exporting}` is on both exports: EPUB used to be missing it,
  // so it could be double-clicked into two full export runs, or started on
  // top of a Bookify — both sharing one `exporting` flag.
  const tools = (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
      {!showRightRail && (
        <Tooltip title="Party & threads">
          <IconButton aria-label="Party and threads" onClick={() => setMobilePanel('right')} sx={toolSx}>
            <PartyIcon />
          </IconButton>
        </Tooltip>
      )}
      {wordedTools ? (
        <>
          {/* The tooltip is the desktop nicety; the aria-label is the label a
              touch user's screen reader gets. A tooltip is never the only label. */}
          <Tooltip title="What your character knows">
            <Button aria-label="Journal" onClick={() => setJournalOpen(true)} startIcon={<JournalIcon />}
              sx={{ color: 'text.primary', minHeight: 40, px: 1.5 }}>
              Journal
            </Button>
          </Tooltip>
          <Box aria-hidden="true" sx={{ width: '1px', height: 24, bgcolor: c.rule, mx: 0.5 }} />
          <Button variant="outlined" onClick={handleBookify} disabled={exporting}
            startIcon={<ExportIcon />} sx={{ minHeight: 40, px: 1.5 }}>
            {exporting ? 'Binding…' : 'Bookify'}
          </Button>
          <Button onClick={handleEpub} disabled={exporting} aria-label="EPUB" sx={{ minHeight: 40, px: 1.25, color: 'text.secondary' }}>
            EPUB
          </Button>
        </>
      ) : (
        <>
          <Tooltip title="Journal — what your character knows">
            <IconButton aria-label="Journal" onClick={() => setJournalOpen(true)} sx={{ ...toolSx, color: c.accent }}>
              <JournalIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Bookify — the tale as prose">
            <span>
              <IconButton aria-label="Bookify" onClick={handleBookify} disabled={exporting} sx={toolSx}>
                {exporting ? <CircularProgress size={18} aria-hidden="true" sx={{ color: 'inherit' }} /> : <ExportIcon />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Download EPUB">
            <span>
              <IconButton aria-label="EPUB" onClick={handleEpub} disabled={exporting} sx={toolSx}>
                <EpubIcon />
              </IconButton>
            </span>
          </Tooltip>
        </>
      )}
    </Box>
  );

  const centerColumn = (
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, minHeight: 0 }}>
      {/* Header: the way back, the tale's name, where it stands. */}
      <Box component="header" sx={{ flexShrink: 0, pb: { xs: 0.75, md: 1.25 }, mb: { xs: 0, md: 0.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, md: 1.5 } }}>
          <Tooltip title="All tales">
            <IconButton component={RouterLink} to="/" aria-label="All tales" sx={{ ...toolSx, ml: { xs: -0.75, md: -0.5 } }}>
              <BackIcon />
            </IconButton>
          </Tooltip>
          <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
            <Typography variant="h3" component="h1" sx={{
              fontSize: { xs: '1.2rem', md: '1.6rem' }, lineHeight: 1.15,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {story.title}
            </Typography>
            <Typography sx={{
              fontFamily: fonts.ui, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.12em',
              textTransform: 'uppercase', color: c.accentLabel, mt: 0.25, whiteSpace: 'pre',
              overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'lining-nums',
            }}>
              {subline}
            </Typography>
          </Box>
          {showLeftRail && tools}
        </Box>

        {/* Phone: the scene strip. Where you are is the first thing a phone
            player loses when the rails fold away, so it stays on screen as the
            button that opens them. */}
        {!showLeftRail && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
            <Button
              aria-label="Scene and character"
              onClick={() => setMobilePanel('left')}
              startIcon={<PlaceIcon sx={{ color: c.accentLabel }} />}
              sx={{
                flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'flex-start', px: 1.25,
                borderRadius: '10px', border: `1px solid ${c.rule}`, bgcolor: alpha(c.paper, 0.7),
                color: 'text.primary', fontFamily: fonts.ui, fontWeight: 500, textAlign: 'left',
              }}
            >
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {scene.locationName || 'An unfolding tale'}
                {scene.timeOfDay ? <Box component="span" sx={{ color: 'text.secondary' }}>{` · ${scene.timeOfDay}`}</Box> : null}
              </Box>
            </Button>
            {tools}
          </Box>
        )}
      </Box>

      {/* The page. The rail scrolls, so it owes a keyboard route into it:
          `tabIndex={0}` makes it focusable (axe `scrollable-region-focusable`)
          and `role="log"` + a name is what turns that focus stop into
          something a screen reader can announce — a role without a name just
          trades one finding for another. `log` and not `region` because the
          narrator appends to it as play advances. */}
      <Box
        ref={containerRef}
        tabIndex={0}
        role="log"
        aria-label="Story transcript"
        sx={{
          flex: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain',
          mx: { xs: -2, sm: 0 },
          '&:focus-visible': { outline: `2px solid ${c.accent}`, outlineOffset: -2 },
        }}
      >
        <Box sx={{
          position: 'relative',
          maxWidth: 760, minHeight: '100%', mx: 'auto',
          px: { xs: 2.5, sm: 4, md: 7 }, pt: { xs: 3, md: 5 }, pb: { xs: 2, md: 4 },
          backgroundColor: c.page,
          borderLeft: { sm: `1px solid ${c.pageEdge}` },
          borderRight: { sm: `1px solid ${c.pageEdge}` },
          boxShadow: c.mode === 'dark'
            ? 'inset 0 0 80px rgba(0,0,0,0.35)'
            : '0 1px 2px rgba(60,35,10,0.12), 0 12px 32px rgba(60,35,10,0.14)',
        }}>
          {/* The candle's light on the sheet. */}
          <Box aria-hidden="true" className="sg-candle-glow" sx={{
            position: 'absolute', inset: 0, bottom: 'auto', height: 320, pointerEvents: 'none',
            background: c.mode === 'dark'
              ? `radial-gradient(ellipse 70% 100% at 50% 0%, ${alpha(c.accent, 0.09)} 0%, transparent 70%)`
              : `radial-gradient(ellipse 70% 100% at 50% 0%, ${alpha('#ffffff', 0.55)} 0%, transparent 70%)`,
          }} />
          <Box sx={{ position: 'relative', maxWidth: '38rem', mx: 'auto' }}>
            {messages.length === 0 && !loading && (
              <Typography sx={{ fontFamily: fonts.text, fontStyle: 'italic', color: 'text.secondary', textAlign: 'center', py: 6 }}>
                The page is blank. Tell the Game Master what you do, and the tale begins.
              </Typography>
            )}
            {messages.map((m, i, all) => renderMessage(m, i, all, player?.name))}
            {loading && <WritingIndicator />}
            <div ref={endRef} />
          </Box>
        </Box>
      </Box>

      <Composer
        value={userInput}
        onChange={setUserInput}
        onSubmit={handleSubmit}
        loading={loading}
        inputRef={inputRef}
        showHint={showLeftRail}
      />
    </Box>
  );

  return (
    // The frame, not a guess at it. This used to be `calc(100vh - 120px)` with
    // a hardcoded 120 that matched neither the 60px top bar nor the container
    // padding — too short on desktop, too tall on a phone with the URL bar
    // showing. The shell already hands the route a correctly-sized box (dvh,
    // top bar and safe areas subtracted); the play surface just fills it.
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: { md: 3, lg: 3, xl: 5 } }}>
      {/* Left rail — back at `md` */}
      {showLeftRail && (
        <Box sx={{ width: { md: 248, lg: 240, xl: 280 }, flexShrink: 0, overflowY: 'auto', pr: 1 }}>
          {leftRail}
        </Box>
      )}

      {/* Center */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>{centerColumn}</Box>

      {/* Right rail — back at `lg`, where there is room for both */}
      {showRightRail && (
        <Box sx={{ width: { lg: 264, xl: 300 }, flexShrink: 0, overflowY: 'auto', pl: 1 }}>
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
            Copy
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
        {!exporting && exportError && (
          <GeekErrorState
            compact
            error={exportError}
            onRetry={handleBookify}
            title="The tale would not bind"
          />
        )}
        {exportData && (
          <Typography component="pre" sx={{
            whiteSpace: 'pre-wrap', fontFamily: fonts.text,
            fontSize: '1.0625rem', lineHeight: 1.75, m: 0, mx: 'auto', maxWidth: '38rem',
          }}>
            {exportData.content}
          </Typography>
        )}
      </CodexDialog>
    </Box>
  );
}

export default StoryPlay;
