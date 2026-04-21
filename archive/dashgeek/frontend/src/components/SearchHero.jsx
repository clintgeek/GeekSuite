import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useLazyQuery } from '@apollo/client';
import { useTheme } from '@mui/material/styles';
import { DASH_SEARCH } from '../graphql/queries';

/**
 * SearchHero — hero search bar for Screen 2 (Suite).
 *
 * Large borderless input, mono placeholder, domain chip filters.
 * Results panel drops in below as the user types; runs a debounced
 * query against DASH_SEARCH. Reuses the GraphQL logic previously
 * housed in pages/Search.jsx.
 *
 * Props:
 *   compact?: boolean — shrinks vertical padding; default false.
 *   autoFocus?: boolean — default false.
 *   maxResults?: number — cap render count per domain group; default 5.
 */

const APP_CHANNELS = [
  { key: 'all',         label: 'All',     domain: null          },
  { key: 'notegeek',    label: 'Notes',   domain: 'notegeek'    },
  { key: 'bujogeek',    label: 'Bujo',    domain: 'bujogeek'    },
  { key: 'bookgeek',    label: 'Books',   domain: 'bookgeek'    },
  { key: 'fitnessgeek', label: 'Meals',   domain: 'fitnessgeek' },
  { key: 'flockgeek',   label: 'Flock',   domain: 'flockgeek'   },
];

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
  fitnessgeek: 'Meals',
  flockgeek:   'Flock',
};

export default function SearchHero({ compact = false, autoFocus = false, maxResults = 5 }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState('all');
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  const monoStack =
    theme.typography.fontFamilyMono ??
    '"JetBrains Mono", "Geist Mono", ui-monospace, monospace';

  const [runSearch, { data, loading, called }] = useLazyQuery(DASH_SEARCH, {
    fetchPolicy: 'network-only',
  });

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Debounced as-you-type search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) return undefined;
    debounceRef.current = setTimeout(() => {
      runSearch({
        variables: {
          query: q,
          apps: channel === 'all' ? null : [channel],
          limit: 30,
        },
      });
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, channel, runSearch]);

  // `/` focuses the input from anywhere on the page
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      const editable = document.activeElement?.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return;
      if (e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const results = data?.dashSearch || [];

  const grouped = useMemo(() => {
    const map = {};
    results.forEach((r) => {
      (map[r.app] = map[r.app] || []).push(r);
    });
    return map;
  }, [results]);

  const trimmed = query.trim();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: compact ? 1 : 1.5 }}>
      {/* Input */}
      <Box
        component="form"
        onSubmit={(e) => e.preventDefault()}
        sx={{
          position: 'relative',
          borderTop: `1px solid ${theme.palette.border ?? theme.palette.divider}`,
          borderBottom: `1px solid ${theme.palette.border ?? theme.palette.divider}`,
          py: compact ? '10px' : { xs: '12px', md: '14px' },
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
            placeholder="Search notes, books, tasks, meals…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: theme.palette.text.primary,
              fontFamily: monoStack,
              fontSize: compact
                ? 'clamp(1rem, 1.6vw, 1.25rem)'
                : 'clamp(1.1rem, 2vw, 1.5rem)',
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

      {/* Channel chips */}
      <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {APP_CHANNELS.map((c) => {
          const active = channel === c.key;
          const domainColor = c.domain ? theme.palette.domains?.[c.domain] ?? null : null;
          return (
            <Box
              key={c.key}
              role="button"
              tabIndex={0}
              onClick={() => setChannel(c.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setChannel(c.key);
                }
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

      {/* Results panel — only when there's a query */}
      {trimmed && (
        <Box
          sx={{
            mt: 0.5,
            border: `1px solid ${theme.palette.border ?? theme.palette.divider}`,
            borderRadius: '8px',
            backgroundColor:
              theme.palette.surfaces?.paper ?? theme.palette.background.paper,
            maxHeight: 'clamp(200px, 32vh, 320px)',
            overflowY: 'auto',
          }}
        >
          {loading && (
            <Box sx={{ p: 2 }}>
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                searching…
              </Typography>
            </Box>
          )}

          {!loading && called && results.length === 0 && (
            <Box sx={{ p: 2 }}>
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                no matches. try a tag path or a partial word.
              </Typography>
            </Box>
          )}

          {!loading && results.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              {Object.entries(grouped).map(([app, items], groupIdx) => {
                const domain = APP_TO_DOMAIN[app];
                const appLabel = APP_LABELS[app] ?? app;
                const domainColor = domain ? theme.palette.domains?.[domain] : null;
                return (
                  <Box
                    key={app}
                    sx={{
                      borderTop:
                        groupIdx === 0
                          ? 'none'
                          : `1px solid ${theme.palette.divider}`,
                      borderLeft: domainColor ? `3px solid ${domainColor}` : 'none',
                    }}
                  >
                    <Box
                      sx={{
                        px: 1.5,
                        pt: 1,
                        pb: 0.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Typography
                        variant="h6"
                        sx={{ color: 'text.secondary', lineHeight: 1 }}
                      >
                        {appLabel}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.disabled', letterSpacing: '0.08em' }}
                      >
                        {items.length}
                      </Typography>
                    </Box>
                    {items.slice(0, maxResults).map((r, i) => (
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
                          px: 1.5,
                          py: 1,
                          borderTop:
                            i === 0
                              ? `1px solid ${theme.palette.divider}`
                              : `1px solid ${theme.palette.divider}`,
                          transition: 'background-color 120ms ease',
                          '&:hover': {
                            backgroundColor:
                              theme.palette.glow?.soft ?? 'action.hover',
                          },
                        }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            gap: 1,
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 500,
                              color: 'text.primary',
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                            }}
                          >
                            {r.title}
                          </Typography>
                          {r.type && (
                            <Typography
                              variant="caption"
                              sx={{
                                color: 'text.disabled',
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                flexShrink: 0,
                              }}
                            >
                              {r.type}
                            </Typography>
                          )}
                        </Box>
                        {r.snippet && (
                          <Typography
                            variant="caption"
                            sx={{
                              display: '-webkit-box',
                              WebkitLineClamp: 1,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              color: 'text.secondary',
                              mt: 0.25,
                            }}
                          >
                            {r.snippet}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
