import React from 'react';
import { Box } from '@mui/material';
import { tokens } from '../theme';

/**
 * The core widget chassis. A hairline-bordered panel with:
 *   - tiny monospace index (01, 02...)
 *   - uppercase monospace dept label ("BUJOGEEK")
 *   - italic serif kicker ("tasks & events")
 *   - body slot for content
 *   - optional bottom meta strip
 *
 * Hover produces a brass underline and a subtle upward translate.
 */
export default function EditorialCard({
  index,
  dept,
  kicker,
  href,
  children,
  meta,
  span = 1,
  rowSpan = 1,
  accent = tokens.brass,
  delay = 0,
}) {
  const Wrapper = href ? 'a' : 'div';
  const wrapperProps = href
    ? { href, target: '_blank', rel: 'noreferrer' }
    : {};

  return (
    <Box
      component={Wrapper}
      {...wrapperProps}
      className="rise"
      sx={{
        gridColumn: {
          xs: 'span 1',
          md: `span ${Math.min(span, 2)}`,
          lg: `span ${span}`,
        },
        gridRow: { lg: `span ${rowSpan}` },
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 220,
        padding: { xs: 2.5, md: 3 },
        color: tokens.bone,
        textDecoration: 'none',
        borderTop: `1px solid ${tokens.rule}`,
        borderLeft: `1px solid ${tokens.rule}`,
        borderRight: `1px solid ${tokens.rule}`,
        borderBottom: `1px solid ${tokens.rule}`,
        background:
          'linear-gradient(180deg, rgba(239,233,220,0.012) 0%, transparent 60%)',
        cursor: href ? 'pointer' : 'default',
        transition: 'transform 400ms var(--ease), border-color 400ms var(--ease)',
        animationDelay: `${delay}ms`,
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          background: accent,
          transform: 'scaleX(0)',
          transformOrigin: 'left',
          transition: 'transform 500ms var(--ease)',
        },
        '&:hover': {
          transform: href ? 'translateY(-2px)' : 'none',
          borderColor: href ? tokens.ruleStrong : tokens.rule,
          '&::before': { transform: 'scaleX(1)' },
          '& .card-arrow': {
            transform: 'translate(3px, -3px)',
            color: accent,
          },
        },
      }}
    >
      {/* Top meta row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2.5,
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
          <Box
            sx={{
              fontFamily: tokens.fontMono,
              fontSize: '0.55rem',
              color: accent,
              letterSpacing: '0.18em',
            }}
          >
            №{index}
          </Box>
          <Box
            sx={{
              fontFamily: tokens.fontMono,
              fontSize: '0.58rem',
              color: tokens.boneDim,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            {dept}
          </Box>
        </Box>
        {href && (
          <Box
            className="card-arrow"
            sx={{
              fontFamily: tokens.fontMono,
              fontSize: '0.7rem',
              color: tokens.boneFaint,
              transition: 'transform 300ms var(--ease), color 300ms var(--ease)',
            }}
          >
            ↗
          </Box>
        )}
      </Box>

      {/* Kicker — italic serif title */}
      {kicker && (
        <Box
          sx={{
            fontFamily: tokens.fontItalic,
            fontStyle: 'italic',
            fontSize: '1.15rem',
            color: tokens.boneDim,
            mb: 2,
            lineHeight: 1.1,
          }}
        >
          {kicker}
        </Box>
      )}

      {/* Body */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</Box>

      {/* Bottom meta strip */}
      {meta && (
        <Box
          sx={{
            mt: 2,
            pt: 1.75,
            borderTop: `1px solid ${tokens.rule}`,
            fontFamily: tokens.fontMono,
            fontSize: '0.58rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: tokens.boneFaint,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          {meta}
        </Box>
      )}
    </Box>
  );
}
