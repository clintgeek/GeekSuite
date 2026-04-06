import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { Link, useLocation } from 'react-router-dom';
import { tokens } from '../theme';

/**
 * Terminal-style page chrome: brand mark, live clock ticker, primary nav.
 * Used as a header on every page in the app.
 */
export default function Brand({ onLogout }) {
  const [now, setNow] = useState(() => new Date());
  const location = useLocation();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const date = now
    .toLocaleDateString('en-US', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .toUpperCase();

  const navItems = [
    { path: '/', label: 'Dash', index: '01' },
    { path: '/search', label: 'Search', index: '02' },
    { path: '/ai', label: 'Telegram', index: '03' },
  ];

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(16px) saturate(140%)',
        WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        background:
          'linear-gradient(180deg, rgba(10,10,12,0.92) 0%, rgba(10,10,12,0.72) 100%)',
        borderBottom: `1px solid ${tokens.rule}`,
      }}
    >
      {/* Top ticker row: meta + clock */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 2, md: 4 },
          py: 1,
          fontFamily: tokens.fontMono,
          fontSize: '0.58rem',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: tokens.boneFaint,
          borderBottom: `1px solid ${tokens.rule}`,
        }}
      >
        <Box sx={{ display: 'flex', gap: 2 }}>
          <span style={{ color: tokens.brass }}>◆</span>
          <span>Private Terminal</span>
          <span style={{ color: tokens.boneGhost }}>/</span>
          <span>Est. MMXXIV</span>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <span>{date}</span>
          <span style={{ color: tokens.boneGhost }}>/</span>
          <span style={{ color: tokens.bone, minWidth: '5.5ch' }}>{time}</span>
          <span className="blink" style={{ color: tokens.brass }}>
            ●
          </span>
        </Box>
      </Box>

      {/* Main brand + nav row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 2, md: 4 },
          py: { xs: 2, md: 2.5 },
          gap: 3,
        }}
      >
        {/* Wordmark */}
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                border: `1px solid ${tokens.brass}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: tokens.fontDisplay,
                fontStyle: 'italic',
                fontSize: '1.25rem',
                color: tokens.brass,
                fontWeight: 500,
                position: 'relative',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  inset: 3,
                  border: `1px solid ${tokens.brass}`,
                  opacity: 0.35,
                },
              }}
            >
              D
            </Box>
            <Box>
              <Box
                sx={{
                  fontFamily: tokens.fontDisplay,
                  fontSize: '1.5rem',
                  lineHeight: 0.95,
                  color: tokens.bone,
                  letterSpacing: '-0.02em',
                }}
              >
                Dash<span style={{ fontStyle: 'italic', color: tokens.brass }}>geek</span>
              </Box>
              <Box
                sx={{
                  fontFamily: tokens.fontMono,
                  fontSize: '0.52rem',
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: tokens.boneFaint,
                  mt: 0.25,
                }}
              >
                Vol. I &nbsp;·&nbsp; The Command Desk
              </Box>
            </Box>
          </Box>
        </Link>

        {/* Nav */}
        <Box
          component="nav"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 2, md: 3 },
          }}
        >
          {navItems.map((item) => {
            const active =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);
            return (
              <Link key={item.path} to={item.path}>
                <Box
                  sx={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 0.75,
                    color: active ? tokens.bone : tokens.boneDim,
                    transition: 'color 200ms var(--ease)',
                    cursor: 'pointer',
                    '&:hover': {
                      color: tokens.bone,
                      '& .nav-underline': { transform: 'scaleX(1)' },
                    },
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      fontFamily: tokens.fontMono,
                      fontSize: '0.55rem',
                      color: tokens.brass,
                      letterSpacing: '0.1em',
                    }}
                  >
                    {item.index}
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      fontFamily: tokens.fontDisplay,
                      fontStyle: active ? 'italic' : 'normal',
                      fontSize: '1.05rem',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {item.label}
                  </Box>
                  <Box
                    className="nav-underline"
                    sx={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: -4,
                      height: '1px',
                      background: tokens.brass,
                      transform: active ? 'scaleX(1)' : 'scaleX(0)',
                      transformOrigin: 'left',
                      transition: 'transform 280ms var(--ease)',
                    }}
                  />
                </Box>
              </Link>
            );
          })}

          {onLogout && (
            <Box
              onClick={onLogout}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onLogout();
              }}
              sx={{
                ml: { xs: 1, md: 2 },
                pl: { xs: 2, md: 3 },
                borderLeft: `1px solid ${tokens.rule}`,
                fontFamily: tokens.fontMono,
                fontSize: '0.55rem',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: tokens.boneFaint,
                cursor: 'pointer',
                transition: 'color 200ms var(--ease)',
                '&:hover': { color: tokens.oxblood },
              }}
            >
              ✕ Sign out
            </Box>
          )}
        </Box>
      </Box>

      <style>{`
        @keyframes dg-blink { 0%,60%{opacity:1} 61%,100%{opacity:0.2} }
        .blink { animation: dg-blink 1.6s steps(1, end) infinite; }
      `}</style>
    </Box>
  );
}
