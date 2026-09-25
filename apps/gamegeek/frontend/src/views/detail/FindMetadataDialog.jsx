/**
 * ⋯ More → "Find metadata…": every provider's candidates for this game's
 * title, no strict filter (that's the worker's job) — a person picks. Used
 * both when a match is ambiguous/missing and when someone just wants to
 * change what matched.
 */
import React, { useEffect, useState } from 'react';
import { Box, ButtonBase, CircularProgress, Typography } from '@mui/material';
import { GeekSheet, useToast } from '@geeksuite/ui';
import { getMetadataCandidates } from '../../api/rest';
import TitlePlate from '../../components/TitlePlate';
import { platformShort } from '../../utils/vocab';

const PROVIDER_LABELS = { steam: 'Steam', igdb: 'IGDB', rawg: 'RAWG' };

function Thumb({ candidate }) {
  const [failed, setFailed] = useState(false);
  return (
    <Box sx={{ position: 'relative', width: 56, aspectRatio: '3 / 4', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, bgcolor: 'background.raised' }}>
      {candidate.coverUrl && !failed ? (
        <Box
          component="img"
          src={candidate.coverUrl}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <TitlePlate title={candidate.title} variant="thumb" />
      )}
    </Box>
  );
}

export default function FindMetadataDialog({ open, onClose, game, onApply, onApplied }) {
  const { notify } = useToast();
  const [state, setState] = useState({ loading: false, candidates: null, error: null });
  const [applying, setApplying] = useState(null);

  useEffect(() => {
    if (!open || !game?.id) return undefined;
    let live = true;
    setState({ loading: true, candidates: null, error: null });
    getMetadataCandidates(game.id)
      .then((res) => {
        if (!live) return;
        setState({ loading: false, candidates: res?.candidates || [], error: null });
      })
      .catch((err) => {
        if (!live) return;
        setState({ loading: false, candidates: [], error: err?.message || "Couldn't look up candidates." });
      });
    return () => {
      live = false;
    };
  }, [open, game?.id]);

  const pick = async (candidate) => {
    const key = `${candidate.provider}-${candidate.providerId}`;
    setApplying(key);
    try {
      await onApply(candidate);
      onApplied?.(candidate);
      onClose();
    } catch (err) {
      // Keep the sheet open on failure so the person can try a different
      // candidate instead of losing their place.
      notify(err?.message || "That match couldn't be applied.", { tone: 'error' });
    } finally {
      setApplying(null);
    }
  };

  return (
    <GeekSheet open={open} onClose={onClose} title="Find metadata" description={game?.title} snap="full" maxWidth="sm">
      {state.loading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress size={24} aria-label="Looking for matches" />
        </Box>
      ) : state.error ? (
        <Typography sx={{ fontSize: '0.875rem', color: 'error.main', py: 2 }}>{state.error}</Typography>
      ) : state.candidates && state.candidates.length ? (
        <Box component="ul" aria-label="Metadata candidates" sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {state.candidates.map((c) => {
            const key = `${c.provider}-${c.providerId}`;
            const plats = (c.platforms || []).slice(0, 4).map(platformShort).join(' · ');
            return (
              <Box component="li" key={key} sx={{ listStyle: 'none' }}>
                <ButtonBase
                  onClick={() => pick(c)}
                  disabled={Boolean(applying)}
                  aria-label={`Use the match from ${PROVIDER_LABELS[c.provider] || c.provider}: ${c.title}${c.year ? ` (${c.year})` : ''}`}
                  sx={{ width: '100%', display: 'flex', gap: 1.5, p: 1, borderRadius: '10px', justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <Thumb candidate={c} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.3 }}>{c.title}</Typography>
                      {c.wouldMatch ? (
                        <Box
                          component="span"
                          sx={{ px: 0.75, height: 20, display: 'inline-flex', alignItems: 'center', borderRadius: '999px', border: 1, borderColor: 'success.main', color: 'success.main', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.02em' }}
                        >
                          Best match
                        </Box>
                      ) : null}
                    </Box>
                    <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                      {[PROVIDER_LABELS[c.provider] || c.provider, c.year].filter(Boolean).join(' · ')}
                    </Typography>
                    {plats ? <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.muted' }}>{plats}</Typography> : null}
                  </Box>
                  {applying === key ? <CircularProgress size={18} sx={{ alignSelf: 'center', flexShrink: 0 }} /> : null}
                </ButtonBase>
              </Box>
            );
          })}
        </Box>
      ) : (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', py: 2 }}>
          No candidates found for “{game?.title}”.
        </Typography>
      )}
    </GeekSheet>
  );
}
