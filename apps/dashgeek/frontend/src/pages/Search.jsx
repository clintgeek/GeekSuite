import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useLazyQuery } from '@apollo/client';
import { useTheme } from '@mui/material/styles';
import useAuthStore from '../store/authStore';
import Brand from '../components/Brand';
import LedgerCard from '../components/LedgerCard';
import { DASH_SEARCH } from '../graphql/queries';

const APP_CHANNELS = [
  { key: 'all',        label: 'All',     domain: null         },
  { key: 'bujogeek',   label: 'Bujo',    domain: 'bujogeek'   },
  { key: 'notegeek',   label: 'Notes',   domain: 'notegeek'   },
  { key: 'bookgeek',   label: 'Books',   domain: 'bookgeek'   },
  { key: 'fitnessgeek',label: 'Fitness', domain: 'fitnessgeek'},
  { key: 'flockgeek',  label: 'Flock',   domain: 'flockgeek'  },
];

// Map search-result app keys to LedgerCard domain prop values
const APP_TO_DOMAIN = {
  bujogeek:    'bujogeek',
  notegeek:    'notegeek',
  bookgeek:    'bookgeek',
  fitnessgeek: 'fitnessgeek',
  flockgeek:   'flockgeek',
};

const APP_LABELS = {
  bujogeek:    'Bujo',
  notegeek:    'Notes',
  bookgeek:    'Books',
  fitnessgeek: 'Fitness',
  flockgeek:   'Flock',
};

export default function SearchPage() {
  const { logout } = useAuthStore();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState('all');
  const inputRef = useRef(null);

  const monoStack =
    theme.typography.fontFamilyMono ??
    '"JetBrains Mono", "Geist Mono", ui-monospace, monospace';

  const [runSearch, { data, loading, called }] = useLazyQuery(DASH_SEARCH, {
    fetchPolicy: 'network-only',
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    runSearch({
      variables: {
        query: q,
        apps: channel === 'all' ? null : [channel],
        limit: 30,
      },
    });
  };

  const results = data?.dashSearch || [];

  // Group by app for the domain-card columns layout
  const grouped = useMemo(() => {
    const map = {};
    results.forEach((r) => {
      (map[r.app] = map[r.app] || []).push(r);
    });
    return map;
  }, [results]);

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
      <Brand onLogout={logout} />

      <Box
        sx={{
          px: { xs: 2, sm: 3, md: 4 },
          pt: { xs: 3, md: 4 },
          pb: { xs: 6, md: 8 },
          maxWidth: 1280,
          mx: 'auto',
        }}
      >
        {/* Compact page header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            py: { xs: 1.5, md: 2 },
            mb: { xs: 2, md: 3 },
          }}
        >
          <Typography
            variant="h6"
            sx={{ color: 'text.primary', lineHeight: 1 }}
          >
            SEARCH
          </Typography>
          <Box
            sx={{
              flex: 1,
              height: '1px',
              backgroundColor: 'divider',
            }}
          />
        </Box>

        {/* Search form — large, borderless, mono placeholder */}
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{
            position: 'relative',
            borderTop: `1px solid ${theme.palette.border ?? theme.palette.divider}`,
            borderBottom: `1px solid ${theme.palette.border ?? theme.palette.divider}`,
            py: { xs: 1.5, md: 2 },
            mb: 2,
            transition: 'border-color 120ms ease',
            '&:focus-within': {
              borderColor: theme.palette.primary.main,
              boxShadow: `0 0 0 3px ${theme.palette.glow?.ring ?? 'transparent'}`,
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                color: 'text.disabled',
                fontFamily: monoStack,
                fontSize: '0.7rem',
                letterSpacing: '0.2em',
                flexShrink: 0,
              }}
            >
              ▸
            </Box>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search every app…"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: theme.palette.text.primary,
                fontFamily: monoStack,
                fontSize: 'clamp(1.1rem, 2.5vw, 1.75rem)',
                letterSpacing: '-0.01em',
                fontWeight: 400,
                padding: 0,
              }}
            />
            <Box
              sx={{
                fontFamily: monoStack,
                fontSize: '0.55rem',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'text.disabled',
                border: `1px solid ${theme.palette.border ?? theme.palette.divider}`,
                borderRadius: '4px',
                px: 1,
                py: 0.5,
                flexShrink: 0,
              }}
            >
              /
            </Box>
          </Box>
        </Box>

        {/* Zero state hint */}
        {!called && !query && (
          <Typography
            variant="caption"
            sx={{ display: 'block', color: 'text.disabled', mb: 3 }}
          >
            type to search · or press / from anywhere
          </Typography>
        )}

        {/* Channel pills */}
        <Box
          sx={{
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            mb: { xs: 4, md: 5 },
          }}
        >
          {APP_CHANNELS.map((c) => {
            const active = channel === c.key;
            const domainColor = c.domain
              ? (theme.palette.domains?.[c.domain] ?? null)
              : null;

            return (
              <Box
                key={c.key}
                role="button"
                tabIndex={0}
                onClick={() => setChannel(c.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setChannel(c.key);
                }}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontFamily: monoStack,
                  fontWeight: 500,
                  fontSize: '0.625rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  px: '10px',
                  py: '5px',
                  borderRadius: '4px',
                  lineHeight: 1,
                  transition: 'all 120ms ease',
                  outline: 'none',
                  userSelect: 'none',
                  // Active: domain color border + glow bg + domain-colored text
                  ...(active
                    ? {
                        border: `1px solid ${domainColor ?? theme.palette.primary.main}`,
                        borderLeftWidth: 3,
                        backgroundColor: theme.palette.glow?.soft ?? 'transparent',
                        color: domainColor ?? theme.palette.primary.main,
                      }
                    : {
                        border: `1px solid ${theme.palette.border ?? theme.palette.divider}`,
                        color: 'text.secondary',
                        '&:hover': {
                          backgroundColor: theme.palette.glow?.soft ?? 'action.hover',
                          color: 'text.primary',
                        },
                      }),
                  '&:focus-visible': {
                    boxShadow: `0 0 0 2px ${theme.palette.glow?.ring ?? 'currentColor'}`,
                  },
                }}
              >
                {/* Domain dot — skip for "All" */}
                {c.domain && (
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: domainColor ?? 'text.disabled',
                      flexShrink: 0,
                    }}
                  />
                )}
                {c.label}
              </Box>
            );
          })}
        </Box>

        {/* Loading */}
        {loading && (
          <Typography variant="body2" color="text.secondary">
            Searching…
          </Typography>
        )}

        {/* Empty state — query typed, no results */}
        {!loading && called && results.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No matches. Try a tag path or a partial word.
          </Typography>
        )}

        {/* Results — 2-column grouped grid using LedgerCard per domain */}
        {!loading && results.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
              gap: 2,
            }}
          >
            {Object.entries(grouped).map(([app, items], groupIdx) => {
              const domain = APP_TO_DOMAIN[app];
              const appLabel = APP_LABELS[app] ?? app;

              return (
                <Box
                  key={app}
                  className="rise"
                  sx={{ animationDelay: `${groupIdx * 60}ms` }}
                >
                  <LedgerCard
                    domain={domain}
                    title={appLabel}
                    action={{
                      label: `${items.length} result${items.length === 1 ? '' : 's'}`,
                    }}
                  >
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {items.slice(0, 8).map((r, i) => (
                        <Box
                          key={r.id}
                          component="a"
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          sx={{
                            display: 'block',
                            textDecoration: 'none',
                            color: 'inherit',
                            py: 1.25,
                            px: 0.5,
                            borderBottom:
                              i < Math.min(items.length, 8) - 1
                                ? `1px solid ${theme.palette.divider}`
                                : 'none',
                            borderRadius: '4px',
                            transition: 'background-color 120ms ease',
                            '&:hover': {
                              backgroundColor: theme.palette.glow?.soft ?? 'action.hover',
                            },
                          }}
                        >
                          {/* Title */}
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              gap: 1,
                              mb: r.snippet ? 0.5 : 0,
                            }}
                          >
                            <Typography
                              variant="body1"
                              sx={{
                                fontWeight: 500,
                                lineHeight: 1.4,
                                color: 'text.primary',
                                minWidth: 0,
                                flex: 1,
                              }}
                            >
                              {r.title}
                            </Typography>
                            {/* Type label — right-aligned mono caption */}
                            {r.type && (
                              <Typography
                                variant="caption"
                                sx={{
                                  color: 'text.disabled',
                                  letterSpacing: '0.08em',
                                  textTransform: 'uppercase',
                                  flexShrink: 0,
                                  lineHeight: 1.6,
                                }}
                              >
                                {r.type}
                              </Typography>
                            )}
                          </Box>

                          {/* Snippet — 2-line clamp */}
                          {r.snippet && (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                overflow: 'hidden',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                lineHeight: 1.5,
                              }}
                            >
                              {r.snippet}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Box>
                  </LedgerCard>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
}
