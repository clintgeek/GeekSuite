import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Box } from '@mui/material';
import { useLazyQuery } from '@apollo/client';
import useAuthStore from '../store/authStore';
import Brand from '../components/Brand';
import { DASH_SEARCH } from '../graphql/queries';
import { tokens } from '../theme';

const APP_CHANNELS = [
  { key: 'all', label: 'All' },
  { key: 'bujogeek', label: 'Bujo' },
  { key: 'notegeek', label: 'Notes' },
  { key: 'bookgeek', label: 'Books' },
  { key: 'fitnessgeek', label: 'Fitness' },
  { key: 'flockgeek', label: 'Flock' },
];

export default function SearchPage() {
  const { logout } = useAuthStore();
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState('all');
  const inputRef = useRef(null);

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

  // Group by app for the editorial columns layout
  const grouped = useMemo(() => {
    const map = {};
    results.forEach((r) => {
      (map[r.app] = map[r.app] || []).push(r);
    });
    return map;
  }, [results]);

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Brand onLogout={logout} />

      <Box sx={{ px: { xs: 2, md: 4 }, pt: { xs: 5, md: 8 }, pb: 8, maxWidth: 1480, mx: 'auto' }}>
        {/* Section masthead */}
        <Box
          className="rise"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            fontFamily: tokens.fontMono,
            fontSize: '0.58rem',
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            color: tokens.boneFaint,
            mb: 4,
          }}
        >
          <span style={{ color: tokens.brass }}>§ II · Search</span>
          <Box sx={{ flex: 1, height: '1px', background: tokens.rule }} />
          <span>The index of everything</span>
        </Box>

        <Box
          className="rise"
          sx={{
            fontFamily: tokens.fontDisplay,
            fontSize: { xs: '2.75rem', md: '5rem', lg: '6rem' },
            lineHeight: 0.95,
            letterSpacing: '-0.035em',
            fontWeight: 300,
            mb: 4,
            animationDelay: '80ms',
          }}
        >
          Look something{' '}
          <Box component="span" sx={{ fontFamily: tokens.fontItalic, fontStyle: 'italic', color: tokens.brass }}>
            up
          </Box>
          <Box component="span" sx={{ color: tokens.brass }}>.</Box>
        </Box>

        {/* Search form — unadorned, huge serif input */}
        <Box
          component="form"
          onSubmit={handleSubmit}
          className="rise"
          sx={{
            position: 'relative',
            borderTop: `1px solid ${tokens.brass}`,
            borderBottom: `1px solid ${tokens.rule}`,
            py: 2,
            mb: 2,
            animationDelay: '220ms',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ color: tokens.brass, fontFamily: tokens.fontMono, fontSize: '0.7rem', letterSpacing: '0.2em' }}>
              ▸
            </Box>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a word, a phrase, a fragment…"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: tokens.bone,
                fontFamily: tokens.fontDisplay,
                fontSize: 'clamp(1.4rem, 3vw, 2.25rem)',
                letterSpacing: '-0.015em',
                fontWeight: 300,
                padding: 0,
              }}
            />
            <Box
              sx={{
                fontFamily: tokens.fontMono,
                fontSize: '0.55rem',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: tokens.boneFaint,
                border: `1px solid ${tokens.rule}`,
                px: 1,
                py: 0.5,
              }}
            >
              Press /
            </Box>
          </Box>
        </Box>

        {/* Channel tabs */}
        <Box
          className="rise"
          sx={{
            display: 'flex',
            gap: 3,
            flexWrap: 'wrap',
            mb: 6,
            animationDelay: '320ms',
          }}
        >
          {APP_CHANNELS.map((c) => {
            const active = channel === c.key;
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
                  cursor: 'pointer',
                  position: 'relative',
                  fontFamily: tokens.fontMono,
                  fontSize: '0.6rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: active ? tokens.brass : tokens.boneDim,
                  pb: 0.5,
                  transition: 'color 200ms var(--ease)',
                  '&:hover': { color: tokens.bone },
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: '1px',
                    background: tokens.brass,
                    transform: active ? 'scaleX(1)' : 'scaleX(0)',
                    transformOrigin: 'left',
                    transition: 'transform 240ms var(--ease)',
                  },
                }}
              >
                {c.label}
              </Box>
            );
          })}
        </Box>

        {/* Results */}
        {loading && (
          <Box
            sx={{
              fontFamily: tokens.fontItalic,
              fontStyle: 'italic',
              fontSize: '1.2rem',
              color: tokens.boneDim,
            }}
          >
            Consulting the index…
          </Box>
        )}

        {!loading && called && results.length === 0 && (
          <Box
            sx={{
              fontFamily: tokens.fontItalic,
              fontStyle: 'italic',
              fontSize: '1.2rem',
              color: tokens.boneDim,
            }}
          >
            Nothing matches that fragment. Try another word.
          </Box>
        )}

        {!loading && !called && (
          <Box
            sx={{
              fontFamily: tokens.fontItalic,
              fontStyle: 'italic',
              fontSize: '1.1rem',
              color: tokens.boneFaint,
              maxWidth: 640,
              lineHeight: 1.6,
            }}
          >
            Every department — tasks, notes, books, meals, birds — is catalogued in
            the same index. Type anything and the relevant drawers will slide open.
          </Box>
        )}

        {!loading && results.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
              gap: 0,
              '& > *': { marginRight: '-1px', marginBottom: '-1px' },
            }}
          >
            {Object.entries(grouped).map(([app, items], groupIdx) => (
              <Box
                key={app}
                className="rise"
                sx={{
                  borderTop: `1px solid ${tokens.rule}`,
                  borderLeft: `1px solid ${tokens.rule}`,
                  borderRight: `1px solid ${tokens.rule}`,
                  borderBottom: `1px solid ${tokens.rule}`,
                  p: 3,
                  animationDelay: `${groupIdx * 80}ms`,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    mb: 2,
                    pb: 1.5,
                    borderBottom: `1px solid ${tokens.rule}`,
                  }}
                >
                  <Box
                    sx={{
                      fontFamily: tokens.fontMono,
                      fontSize: '0.6rem',
                      letterSpacing: '0.22em',
                      textTransform: 'uppercase',
                      color: tokens.brass,
                    }}
                  >
                    {app}
                  </Box>
                  <Box
                    sx={{
                      fontFamily: tokens.fontMono,
                      fontSize: '0.55rem',
                      letterSpacing: '0.18em',
                      color: tokens.boneFaint,
                    }}
                  >
                    {items.length} entr{items.length === 1 ? 'y' : 'ies'}
                  </Box>
                </Box>

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
                      color: tokens.bone,
                      py: 1.5,
                      borderBottom:
                        i < Math.min(items.length, 8) - 1 ? `1px solid ${tokens.rule}` : 'none',
                      cursor: 'pointer',
                      transition: 'transform 200ms var(--ease)',
                      '&:hover': {
                        transform: 'translateX(4px)',
                        '& .result-title': { color: tokens.brass },
                      },
                    }}
                  >
                    <Box
                      className="result-title"
                      sx={{
                        fontFamily: tokens.fontDisplay,
                        fontSize: '1.05rem',
                        fontWeight: 400,
                        mb: 0.5,
                        transition: 'color 200ms var(--ease)',
                      }}
                    >
                      {r.title}
                    </Box>
                    {r.snippet && (
                      <Box
                        sx={{
                          fontFamily: tokens.fontItalic,
                          fontStyle: 'italic',
                          fontSize: '0.85rem',
                          color: tokens.boneDim,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {r.snippet}
                      </Box>
                    )}
                    <Box
                      sx={{
                        mt: 0.75,
                        fontFamily: tokens.fontMono,
                        fontSize: '0.5rem',
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        color: tokens.boneFaint,
                      }}
                    >
                      {r.type}
                    </Box>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
