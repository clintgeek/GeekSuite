import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Slider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { useTheme } from '@mui/material/styles';

export default function NowPlayingDialog({
  open,
  onClose,
  queue = [],
  currentlyPlaying = null,
  onControl,
}) {
  const theme = useTheme();
  const monoStack =
    theme.typography.fontFamilyMono ??
    '"JetBrains Mono", "Geist Mono", ui-monospace, monospace';
  const domainColor = theme.palette.domains?.bookgeek;

  const [volume, setVolume] = useState(60);
  const [shuffle, setShuffle] = useState(false);

  const handleVolumeCommit = (_e, value) => {
    setVolume(value);
    onControl?.('volume', { volume_percent: value });
  };

  const toggleShuffle = () => {
    const next = !shuffle;
    setShuffle(next);
    onControl?.('shuffle', { state: next });
  };

  const isPlaying = currentlyPlaying?.is_playing ?? true; // when dialog shows track we assume playback

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="nowplaying-dialog-title"
      slotProps={{
        backdrop: { sx: { backdropFilter: 'blur(6px)' } },
      }}
    >
      <DialogTitle
        id="nowplaying-dialog-title"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${theme.palette.divider}`,
          fontFamily: monoStack,
          fontWeight: 600,
          fontSize: '0.75rem',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
        }}
      >
        Up Next
        <IconButton onClick={onClose} aria-label="Close" size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ py: 2 }}>
        {/* Now row */}
        {currentlyPlaying && (
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            pb: 2,
            mb: 2,
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}>
            {currentlyPlaying.album_art_url && (
              <Box
                component="img"
                src={currentlyPlaying.album_art_url}
                alt=""
                sx={{ width: 56, height: 56, borderRadius: 1, objectFit: 'cover' }}
              />
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body1"
                sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {currentlyPlaying.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentlyPlaying.artist}
                {currentlyPlaying.album ? ` · ${currentlyPlaying.album}` : ''}
              </Typography>
            </Box>
            <Box
              component="span"
              sx={{
                fontFamily: monoStack,
                fontSize: '0.6875rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: domainColor ?? 'text.secondary',
                flexShrink: 0,
              }}
            >
              Now
            </Box>
          </Box>
        )}

        {/* Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <IconButton onClick={toggleShuffle} aria-label="Toggle shuffle" size="small" sx={{ color: shuffle ? domainColor : 'text.secondary' }}>
            <ShuffleIcon fontSize="small" />
          </IconButton>
          <IconButton onClick={() => onControl?.('previous')} aria-label="Previous track" size="small" sx={{ color: 'text.secondary' }}>
            <SkipPreviousIcon fontSize="small" />
          </IconButton>
          <IconButton
            onClick={() => onControl?.(isPlaying ? 'pause' : 'play')}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            sx={{
              color: domainColor ?? 'text.primary',
              border: `1px solid ${theme.palette.border ?? theme.palette.divider}`,
            }}
          >
            {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
          </IconButton>
          <IconButton onClick={() => onControl?.('next')} aria-label="Next track" size="small" sx={{ color: 'text.secondary' }}>
            <SkipNextIcon fontSize="small" />
          </IconButton>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto', minWidth: 160, flex: '0 1 auto' }}>
            <VolumeUpIcon fontSize="small" sx={{ color: 'text.secondary' }} aria-hidden="true" />
            <Slider
              size="small"
              value={volume}
              onChange={(_e, v) => setVolume(v)}
              onChangeCommitted={handleVolumeCommit}
              aria-label="Volume"
              min={0}
              max={100}
              sx={{
                color: domainColor ?? theme.palette.primary.main,
                '& .MuiSlider-thumb': { width: 10, height: 10 },
              }}
            />
          </Box>
        </Box>

        {/* Queue list */}
        {queue.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Queue is empty
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {queue.map((item, i) => (
              <Box
                key={`${item.name}-${i}`}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  py: 1,
                  borderTop: i === 0 ? 'none' : `1px solid ${theme.palette.divider}`,
                }}
              >
                <Box
                  component="span"
                  sx={{
                    fontFamily: monoStack,
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '0.75rem',
                    color: 'text.disabled',
                    width: 24,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </Box>
                {item.album_art_url ? (
                  <Box component="img" src={item.album_art_url} alt="" sx={{ width: 32, height: 32, borderRadius: 0.5, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <Box sx={{ width: 32, height: 32, borderRadius: 0.5, backgroundColor: theme.palette.glow?.soft ?? 'action.hover', flexShrink: 0 }} />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'text.secondary' }}
                  >
                    {item.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ display: 'block', color: 'text.disabled', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {item.artist}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
