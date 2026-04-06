import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import useAuthStore from '../store/authStore';
import Brand from '../components/Brand';
import { tokens } from '../theme';

import BujoWidget from '../components/widgets/BujoWidget';
import NotesWidget from '../components/widgets/NotesWidget';
import BooksWidget from '../components/widgets/BooksWidget';
import NutritionWidget from '../components/widgets/NutritionWidget';
import WeightWidget from '../components/widgets/WeightWidget';
import FlockWidget from '../components/widgets/FlockWidget';

function greetingFor(hour) {
  if (hour < 5) return 'Still at the desk';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Burning the midnight oil';
}

export default function Dashboard() {
  const { logout, user } = useAuthStore();
  const [now] = useState(new Date());

  const greeting = greetingFor(now.getHours());
  const firstName =
    user?.profile?.firstName ||
    user?.firstName ||
    user?.name?.split?.(' ')?.[0] ||
    user?.username?.split?.('@')?.[0] ||
    'Chef';

  const longDate = now
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  // Issue number based on day-of-year — a nice editorial touch
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Brand onLogout={logout} />

      {/* Editorial masthead */}
      <Box
        component="section"
        sx={{
          px: { xs: 2, md: 4 },
          pt: { xs: 5, md: 8 },
          pb: { xs: 4, md: 6 },
          maxWidth: 1480,
          mx: 'auto',
        }}
      >
        {/* Issue strip */}
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
            mb: { xs: 4, md: 6 },
          }}
        >
          <span style={{ color: tokens.brass }}>Issue №{dayOfYear.toString().padStart(3, '0')}</span>
          <Box sx={{ flex: 1, height: '1px', background: tokens.rule }} />
          <span>{longDate}</span>
        </Box>

        {/* The greeting — the moment */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr auto' },
            alignItems: 'end',
            gap: { xs: 3, md: 6 },
            mb: { xs: 5, md: 7 },
          }}
        >
          <Box>
            <Box
              className="rise"
              sx={{
                fontFamily: tokens.fontDisplay,
                fontSize: { xs: '2.75rem', sm: '4rem', md: '5.5rem', lg: '6.5rem' },
                lineHeight: 0.92,
                letterSpacing: '-0.035em',
                color: tokens.bone,
                fontWeight: 300,
                animationDelay: '80ms',
              }}
            >
              {greeting},{' '}
              <Box
                component="span"
                sx={{
                  fontFamily: tokens.fontItalic,
                  fontStyle: 'italic',
                  color: tokens.brass,
                  fontWeight: 400,
                }}
              >
                {firstName}
              </Box>
              <Box component="span" sx={{ color: tokens.brass }}>.</Box>
            </Box>
            <Box
              className="rise"
              sx={{
                mt: 3,
                maxWidth: 560,
                fontFamily: tokens.fontDisplay,
                fontSize: { xs: '0.95rem', md: '1.1rem' },
                lineHeight: 1.55,
                color: tokens.boneDim,
                fontWeight: 300,
                animationDelay: '220ms',
              }}
            >
              Your six departments report in below. The kitchen is quiet, the ledger
              is open, and the birds are accounted for.
            </Box>
          </Box>

          {/* Right rail — tiny dispatch panel */}
          <Box
            className="rise"
            sx={{
              display: { xs: 'none', md: 'block' },
              minWidth: 220,
              borderLeft: `1px solid ${tokens.rule}`,
              pl: 3,
              animationDelay: '320ms',
            }}
          >
            <Box
              sx={{
                fontFamily: tokens.fontMono,
                fontSize: '0.55rem',
                letterSpacing: '0.2em',
                color: tokens.boneFaint,
                textTransform: 'uppercase',
                mb: 1.5,
              }}
            >
              ── Dispatch
            </Box>
            <Box
              sx={{
                fontFamily: tokens.fontItalic,
                fontStyle: 'italic',
                fontSize: '1.05rem',
                color: tokens.boneDim,
                lineHeight: 1.35,
                mb: 1.5,
              }}
            >
              “Calm code, clear mind. Chaos is for staging branches.”
            </Box>
            <Box
              sx={{
                fontFamily: tokens.fontMono,
                fontSize: '0.5rem',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: tokens.brass,
              }}
            >
              ── The Sage Laws
            </Box>
          </Box>
        </Box>

        {/* Section rule */}
        <Box
          sx={{
            position: 'relative',
            height: '1px',
            background: tokens.rule,
            mb: { xs: 4, md: 6 },
          }}
        >
          <Box
            className="draw"
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '42%',
              height: '1px',
              background: tokens.brass,
              animationDelay: '550ms',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              top: -9,
              left: '42%',
              fontFamily: tokens.fontMono,
              fontSize: '0.55rem',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: tokens.brass,
              background: tokens.ink,
              px: 1.5,
            }}
          >
            § Departments
          </Box>
        </Box>

        {/* The widget grid — magazine layout: 3 columns at lg */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              lg: 'repeat(3, 1fr)',
            },
            gap: 0,
            // Collapse internal borders so hairlines are shared
            '& > *': {
              marginRight: '-1px',
              marginBottom: '-1px',
            },
          }}
        >
          <BujoWidget delay={100} />
          <NutritionWidget delay={160} />
          <FlockWidget delay={220} />
          <WeightWidget delay={280} />
          <NotesWidget delay={340} />
          <BooksWidget delay={400} />
        </Box>

        {/* Footer colophon */}
        <Box
          className="rise"
          sx={{
            mt: { xs: 6, md: 10 },
            pt: 3,
            borderTop: `1px solid ${tokens.rule}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: tokens.fontMono,
            fontSize: '0.55rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: tokens.boneFaint,
            animationDelay: '600ms',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <span>Published daily · Hand-set in Fraunces</span>
          <span style={{ color: tokens.brass }}>
            ◆ Printed for the eyes of {firstName} ◆
          </span>
          <span>The Command Desk · GeekSuite</span>
        </Box>
      </Box>
    </Box>
  );
}
