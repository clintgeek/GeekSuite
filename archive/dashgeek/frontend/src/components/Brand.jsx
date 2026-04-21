import React, { useEffect, useState } from 'react';
import { Box, Tooltip, IconButton } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Link, useLocation } from 'react-router-dom';
import LogoutIcon from '@mui/icons-material/Logout';

/**
 * Brand — dashgeek site chrome.
 *
 * Sticky header with:
 *   - DASHGEEK wordmark (Geist 700 caps, 0.12em tracking)
 *   - Primary nav: DASH / SEARCH / DIGEST (mono caps, active underline)
 *   - Live clock ticker — mono caption, far-right, hidden on xs
 *   - Logout icon button with tooltip
 *
 * Background: surfaces.paper + 1px divider bottom. No blur, no gradient.
 */
export default function Brand({ onLogout }) {
  const theme = useTheme();
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

  const monoStack =
    theme.typography.fontFamilyMono ??
    '"JetBrains Mono", "Geist Mono", ui-monospace, monospace';

  const navItems = [
    { path: '/',       label: 'AMBIENT' },
    { path: '/suite',  label: 'SUITE'   },
    { path: '/digest', label: 'DIGEST'  },
  ];

  // Two-dot pager reflects shell position; hidden off-shell (/digest, /login)
  const isOnShell = location.pathname === '/' || location.pathname.startsWith('/suite');
  const shellIndex = location.pathname.startsWith('/suite') ? 1 : 0;

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: theme.palette.surfaces?.paper ?? theme.palette.background.paper,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 2, md: 4 },
          py: { xs: 1.25, md: 1.5 },
          gap: 3,
          minHeight: { xs: 52, md: 56 },
        }}
      >
        {/* Wordmark */}
        <Link to="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
          <Box
            sx={{
              fontFamily:
                '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              fontWeight: 700,
              fontSize: '0.9375rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'text.primary',
              lineHeight: 1,
              userSelect: 'none',
            }}
          >
            DashGeek
          </Box>
        </Link>

        {/* Nav */}
        <Box
          component="nav"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 2, md: 3 },
            flex: 1,
            ml: { xs: 2, md: 4 },
          }}
        >
          {navItems.map((item) => {
            const active =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);

            return (
              <Link key={item.path} to={item.path} style={{ textDecoration: 'none' }}>
                <Box
                  sx={{
                    position: 'relative',
                    fontFamily: monoStack,
                    fontWeight: 600,
                    fontSize: '0.625rem',
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    color: active ? 'text.primary' : 'text.secondary',
                    lineHeight: 1,
                    pb: '4px',
                    transition: 'color 150ms ease',
                    cursor: 'pointer',
                    '&:hover': {
                      color: 'text.primary',
                    },
                    // Active underline
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: '2px',
                      borderRadius: '1px',
                      backgroundColor: theme.palette.primary.main,
                      transform: active ? 'scaleX(1)' : 'scaleX(0)',
                      transformOrigin: 'left',
                      transition: 'transform 200ms ease',
                    },
                    '&:hover::after': {
                      transform: 'scaleX(1)',
                    },
                  }}
                >
                  {item.label}
                </Box>
              </Link>
            );
          })}
        </Box>

        {/* Right: shell pager + clock + logout */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexShrink: 0,
          }}
        >
          {/* Two-dot shell pager — only visible on / or /suite */}
          {isOnShell && (
            <Box
              aria-label="Shell position"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                pr: 0.5,
              }}
            >
              {[0, 1].map((i) => {
                const active = i === shellIndex;
                return (
                  <Box
                    key={i}
                    sx={{
                      width: active ? 16 : 6,
                      height: 4,
                      borderRadius: '2px',
                      backgroundColor: active
                        ? theme.palette.text.primary
                        : theme.palette.text.disabled,
                      transition:
                        'width 180ms ease, background-color 180ms ease',
                    }}
                  />
                );
              })}
            </Box>
          )}

          {/* Clock — hidden on xs */}
          <Box
            sx={{
              display: { xs: 'none', sm: 'block' },
              fontFamily: monoStack,
              fontWeight: 500,
              fontSize: '0.6875rem',
              color: 'text.disabled',
              letterSpacing: '0.04em',
              minWidth: '5.5ch',
              textAlign: 'right',
              userSelect: 'none',
            }}
          >
            {time}
          </Box>

          {/* Logout */}
          {onLogout && (
            <Tooltip title="Sign out" placement="bottom-end" arrow>
              <IconButton
                onClick={onLogout}
                size="small"
                aria-label="Sign out"
                sx={{
                  color: 'text.disabled',
                  transition: 'color 150ms ease',
                  '&:hover': { color: 'text.secondary', backgroundColor: 'transparent' },
                  '&:focus-visible': {
                    boxShadow: `0 0 0 2px ${theme.palette.glow?.ring ?? theme.palette.primary.main}`,
                  },
                  p: '4px',
                }}
              >
                <LogoutIcon sx={{ fontSize: '1rem' }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
    </Box>
  );
}
