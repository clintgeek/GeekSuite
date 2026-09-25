/**
 * Step one of Add game: type a title, pick the right game. Debounced search
 * against the gamegeek backend's metadata providers (IGDB, else the Steam
 * store), with the provider named and a quiet note when IGDB is not set up.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, ButtonBase, CircularProgress, InputAdornment, TextField, Typography } from '@mui/material';
import { EditNote as ManualIcon, Search as SearchIcon } from '@mui/icons-material';
import { searchMetadata } from '../../api/rest';
import TitlePlate from '../../components/TitlePlate';
import { useProviders } from '../../hooks/useProviders';
import { platformShort } from '../../utils/vocab';

const PROVIDER_NAMES = { igdb: 'IGDB', 'steam-store': 'the Steam store', steam: 'the Steam store', steamStore: 'the Steam store' };

function Thumb({ candidate }) {
  const [failed, setFailed] = useState(false);
  return (
    <Box sx={{ position: 'relative', width: 48, aspectRatio: '3 / 4', borderRadius: '5px', overflow: 'hidden', flexShrink: 0, bgcolor: 'background.raised' }}>
      {candidate.coverUrl && !failed ? (
        <Box component="img" src={candidate.coverUrl} alt="" loading="lazy" onError={() => setFailed(true)} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <TitlePlate title={candidate.title} variant="thumb" />
      )}
    </Box>
  );
}

export default function SearchStep({ initialQuery = '', onPick, onManual }) {
  const providers = useProviders();
  const [q, setQ] = useState(initialQuery);
  const [state, setState] = useState({ loading: false, results: null, provider: null, error: null });
  const reqId = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setState({ loading: false, results: null, provider: null, error: null });
      return undefined;
    }
    const id = ++reqId.current;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    setState((s) => ({ ...s, loading: true, error: null }));
    const t = setTimeout(() => {
      searchMetadata(term, { limit: 12, signal: ctrl?.signal })
        .then((res) => {
          if (id !== reqId.current) return;
          setState({ loading: false, results: res?.results || [], provider: res?.provider || null, error: null });
        })
        .catch((err) => {
          if (id !== reqId.current || err?.name === 'AbortError') return;
          setState({ loading: false, results: [], provider: null, error: err?.message || 'Search failed.' });
        });
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl?.abort();
    };
  }, [q]);

  const providerName = state.provider ? PROVIDER_NAMES[state.provider] || state.provider : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <TextField
        autoFocus
        fullWidth
        label="Game title"
        placeholder="Hades, Stardew Valley, Tears of the Kingdom…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: 'text.secondary' }} />
            </InputAdornment>
          ),
          endAdornment: state.loading ? (
            <InputAdornment position="end">
              <CircularProgress size={18} aria-label="Searching" />
            </InputAdornment>
          ) : null,
        }}
      />

      {providers && !providers.igdb ? (
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.5 }}>
          {providers.steamStore
            ? 'Searching the Steam store. Console games and richer details (platforms, modes, time to beat) arrive once IGDB keys are set on the server.'
            : 'No metadata provider is configured on the server yet, so search is off — enter games manually for now.'}
        </Typography>
      ) : null}

      {state.error ? (
        <Typography sx={{ fontSize: '0.875rem', color: 'error.main' }}>{state.error}</Typography>
      ) : null}

      {state.results && state.results.length ? (
        <>
          {providerName ? (
            <Typography sx={{ fontSize: '0.75rem', color: 'text.muted' }}>
              {state.results.length} from {providerName}
            </Typography>
          ) : null}
          <Box component="ul" aria-label="Search results" sx={{ m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {state.results.map((c) => {
              const year = c.releaseDate ? new Date(c.releaseDate).getUTCFullYear() : null;
              const plats = (c.platforms || []).slice(0, 4).map(platformShort).join(' · ');
              return (
                <Box component="li" key={`${c.provider}-${c.providerId}`} sx={{ listStyle: 'none' }}>
                  <ButtonBase
                    onClick={() => onPick(c)}
                    sx={{ width: '100%', display: 'flex', gap: 1.5, p: 1, borderRadius: '10px', justifyContent: 'flex-start', textAlign: 'left', '&:hover': { bgcolor: 'action.hover' } }}
                  >
                    <Thumb candidate={c} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.3 }}>{c.title}</Typography>
                      <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                        {[year, c.developers?.[0]].filter(Boolean).join(' · ') || ' '}
                      </Typography>
                      {plats ? <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.muted' }}>{plats}</Typography> : null}
                    </Box>
                  </ButtonBase>
                </Box>
              );
            })}
          </Box>
        </>
      ) : state.results && !state.loading && !state.error ? (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          Nothing found for “{q.trim()}”. Check the spelling, or enter it yourself.
        </Typography>
      ) : null}

      <Button
        variant="outlined"
        startIcon={<ManualIcon />}
        onClick={() => onManual(q.trim())}
        sx={{ alignSelf: 'flex-start', color: 'text.primary', mt: 0.5 }}
      >
        {q.trim() ? `Enter “${q.trim().slice(0, 30)}” manually` : 'Enter a game manually'}
      </Button>
    </Box>
  );
}
