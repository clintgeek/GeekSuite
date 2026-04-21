import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import AmbientCard from './AmbientCard';
import NowPlayingDialog from './dialogs/NowPlayingDialog';
import useInterval from '../../hooks/useInterval';

const DOMAIN = 'bookgeek';
const POLL_MS = 10 * 1000; // 10 s

function formatTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function controlSpotify(action, body) {
  try {
    await fetch(`/api/ambient/spotify/${action}`, {
      method: 'POST',
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { /* swallow */ }
}

export default function NowPlaying() {
  const theme = useTheme();
  const domainColor = theme.palette.domains?.[DOMAIN];
  const monoStack =
    theme.typography.fontFamilyMono ??
    '"JetBrains Mono", "Geist Mono", ui-monospace, monospace';
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(null);
  const [open, setOpen] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const [queueState, setQueueState] = useState({ queue: [], currently_playing: null });

  const lastPollRef = useRef(Date.now());

  const fetchTrack = useCallback(async () => {
    try {
      const res = await fetch('/api/ambient/spotify/now-playing', { credentials: 'include' });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        setExpired(body.provider ?? 'spotify');
        setLoading(false);
        return;
      }
      if (res.status === 204) {
        setPayload({ is_playing: false, track: null });
        setExpired(null);
        setLoading(false);
        return;
      }
      if (!res.ok) { setLoading(false); return; }
      const json = await res.json();
      setPayload(json);
      setExpired(null);
      setLoading(false);
      lastPollRef.current = Date.now();
      if (json?.track?.progress_ms != null) {
        setLocalProgress(json.track.progress_ms);
      }
    } catch {
      setLoading(false);
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/ambient/spotify/queue', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setQueueState({
          queue: json.queue ?? [],
          currently_playing: json.currently_playing ?? null,
        });
      }
    } catch { /* swallow */ }
  }, []);

  useInterval(fetchTrack, POLL_MS);

  const track = payload?.track;
  const isPlaying = !!payload?.is_playing;
  const durationMs = track?.duration_ms ?? 0;

  // Local progress tick — every 500ms so the bar moves smoothly.
  useEffect(() => {
    if (!isPlaying || !durationMs) return undefined;
    const id = setInterval(() => {
      setLocalProgress(prev => Math.min(prev + 500, durationMs));
    }, 500);
    return () => clearInterval(id);
  }, [isPlaying, durationMs]);

  const onControl = async (action, body) => {
    await controlSpotify(action, body);
    setTimeout(() => { fetchTrack(); fetchQueue(); }, 400);
  };

  const progressPct = durationMs > 0
    ? Math.min(100, (localProgress / durationMs) * 100)
    : 0;

  const hasTrack = !!track;

  const openDialog = () => {
    fetchQueue();
    setOpen(true);
  };

  // Stop clicks on interactive elements from bubbling to the card
  // (the card isn't a <button> in the rich-player branch — no onClick prop —
  // but the album art still opens the dialog, so we keep the handlers tight).
  const stop = (e) => e.stopPropagation();

  return (
    <>
      <AmbientCard
        domain={DOMAIN}
        title="SPOTIFY"
        loading={loading && !payload}
        empty={!loading && !expired && !hasTrack}
        emptyLabel="Nothing playing"
        expiredProvider={expired}
      >
        {hasTrack && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
            {/* Top: album art + track info */}
            <Box sx={{ display: 'flex', gap: 2, minWidth: 0, alignItems: 'flex-start' }}>
              {track.album_art_url ? (
                <Box
                  component="img"
                  src={track.album_art_url}
                  alt={`${track.album ?? 'Album'} cover`}
                  onClick={openDialog}
                  sx={{
                    width: 140,
                    height: 140,
                    borderRadius: '12px',
                    objectFit: 'cover',
                    flexShrink: 0,
                    display: 'block',
                    cursor: 'pointer',
                    transition: 'transform 160ms ease, box-shadow 160ms ease',
                    boxShadow: theme.palette.mode === 'dark'
                      ? '0 4px 16px rgba(0,0,0,0.4)'
                      : '0 4px 16px rgba(0,0,0,0.12)',
                    '&:hover': {
                      transform: 'scale(1.02)',
                    },
                  }}
                />
              ) : (
                <Box
                  aria-hidden="true"
                  onClick={openDialog}
                  sx={{
                    width: 140,
                    height: 140,
                    borderRadius: '12px',
                    backgroundColor: theme.palette.glow?.soft ?? 'action.hover',
                    flexShrink: 0,
                    cursor: 'pointer',
                  }}
                />
              )}

              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.5,
                  pt: 0.5,
                }}
              >
                <Typography
                  component="h3"
                  sx={{
                    fontWeight: 600,
                    fontSize: '1.125rem',
                    lineHeight: 1.25,
                    color: 'text.primary',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {track.name}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.3,
                  }}
                >
                  {track.artist}
                  {track.album ? ` — ${track.album}` : ''}
                </Typography>
              </Box>
            </Box>

            {/* Progress row: mm:ss ━━━●━━━ mm:ss */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
              <Box
                component="span"
                sx={{
                  fontFamily: monoStack,
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: '0.6875rem',
                  color: 'text.disabled',
                  flexShrink: 0,
                  width: '3.25ch',
                  textAlign: 'right',
                }}
              >
                {formatTime(localProgress)}
              </Box>
              <Box
                sx={{
                  flex: 1,
                  height: 2,
                  borderRadius: 1,
                  overflow: 'hidden',
                  backgroundColor: 'divider',
                }}
              >
                <Box
                  sx={{
                    width: `${progressPct}%`,
                    height: '100%',
                    backgroundColor: domainColor ?? theme.palette.primary.main,
                    transition: 'width 400ms linear',
                  }}
                />
              </Box>
              <Box
                component="span"
                sx={{
                  fontFamily: monoStack,
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: '0.6875rem',
                  color: 'text.disabled',
                  flexShrink: 0,
                  width: '3.25ch',
                }}
              >
                {formatTime(durationMs)}
              </Box>
            </Box>

            {/* Controls row — centered prev · play/pause · next */}
            <Box
              onClick={stop}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
              }}
            >
              <IconButton
                onClick={() => onControl('previous')}
                aria-label="Previous track"
                size="small"
                sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
              >
                <SkipPreviousIcon />
              </IconButton>
              <IconButton
                onClick={() => onControl(isPlaying ? 'pause' : 'play')}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                sx={{
                  color: domainColor ?? 'text.primary',
                  border: `1px solid ${theme.palette.divider}`,
                  width: 40,
                  height: 40,
                  '&:hover': {
                    borderColor: domainColor ?? theme.palette.primary.main,
                    backgroundColor: 'action.hover',
                  },
                }}
              >
                {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
              </IconButton>
              <IconButton
                onClick={() => onControl('next')}
                aria-label="Next track"
                size="small"
                sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
              >
                <SkipNextIcon />
              </IconButton>
            </Box>
          </Box>
        )}
      </AmbientCard>

      <NowPlayingDialog
        open={open}
        onClose={() => setOpen(false)}
        queue={queueState.queue}
        currentlyPlaying={queueState.currently_playing ?? track}
        onControl={onControl}
      />
    </>
  );
}
