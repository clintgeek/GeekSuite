import React from 'react';
import { Box, Button, ButtonBase, Collapse, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ExpandMore as ExpandIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { Surface, Ring, Tag } from '../primitives';
import { fmt } from '../../utils/plainWords.js';
import { leftTitle, ringCaption } from './leftWords.js';
import { useRememberedOpen } from './useRememberedOpen.js';
import { WIZARD_ROUTE } from '../Dashboard/PlanAccuracyBanner.jsx';

export const DETAILS_OPEN_KEY = 'fg.today.details.v1';

/**
 * "What is left" (DOCS/ONE_APP_PLAN.md §1.2): the calorie ring and the
 * sentence. The ring is the budget at a glance (how much of the target is
 * eaten) with the amount left in its middle; the sentence beside it says the
 * same in words.
 *
 * Everything else about the day's numbers (protein, carbs, fat, keto net
 * carbs, the activity add-back, changing today's target) is `children`,
 * behind one "Macros and details" disclosure. It is closed until asked for,
 * and the choice is remembered on this device.
 *
 * `problem` replaces the ring and the sentence when the day couldn't be read:
 * a failed read is never drawn as an empty day (review L1). The target at the
 * top right is the way to the calorie plan.
 *
 * `wash` (today only) is the time-of-day sky colour from daylight.js: a faint
 * tint at the top of the card that fades into the paper.
 */
export default function WhatIsLeft({
  day,
  today,
  eaten = 0,
  goal = 0,
  headline,
  detail,
  problem = null,
  offer = null,
  note = null,
  wash = null,
  children = null,
}) {
  const theme = useTheme();
  const [open, toggle] = useRememberedOpen(DETAILS_OPEN_KEY, false);
  const hasGoal = goal > 0;
  const overBy = hasGoal && eaten > goal ? eaten - goal : 0;
  const ringValue = hasGoal ? (eaten / goal) * 100 : 0;

  return (
    <Surface
      component="section"
      aria-labelledby="home-nutrition"
      data-testid="home-hero"
      sx={wash ? { backgroundImage: `linear-gradient(180deg, ${wash} 0%, ${theme.palette.background.paper} 62%)` } : undefined}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3, minHeight: 44, mb: 2 }}>
        <Typography id="home-nutrition" component="h2" sx={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
          {leftTitle(day, today, hasGoal)}
        </Typography>
        {hasGoal && (
          <ButtonBase
            component={RouterLink}
            to={WIZARD_ROUTE}
            data-testid="target-link"
            aria-label={`Your target is ${fmt(goal)} calories. Open your calorie plan`}
            sx={{
              minHeight: 44,
              px: 2,
              mr: -2,
              borderRadius: '10px',
              fontSize: '0.9375rem',
              color: 'text.secondary',
              whiteSpace: 'nowrap',
              '@media (hover: hover)': { '&:hover': { bgcolor: 'action.hover' } },
              '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
            }}
          >
            Target&nbsp;<Box component="b" sx={{ fontWeight: 600, color: 'text.primary' }}>{fmt(goal)}</Box>&nbsp;cal
          </ButtonBase>
        )}
      </Box>

      {problem || (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 4, sm: 6 } }}>
          <Ring value={ringValue} color={overBy > 0 ? theme.palette.warning.main : undefined} size={132}>
            <Box
              data-testid="plate-number"
              sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, fontSize: '1.875rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}
            >
              {overBy > 0 && <Tag tone="warning" sx={{ letterSpacing: 0 }}>Over</Tag>}
              {fmt(!hasGoal ? eaten : overBy > 0 ? overBy : goal - eaten)}
            </Box>
            <Typography component="span" sx={{ mt: 1, fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.2 }}>
              calories
            </Typography>
          </Ring>
          <Box sx={{ minWidth: 0 }}>
            {/* With a target and room left, the title and the sentence already
                say "left today"; the caption is only for the other cases. */}
            {/* With no target the title already says "Eaten today". */}
            {((!hasGoal && day && today && day !== today) || overBy > 0) && (
              <Typography sx={{ mb: 0.5, fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>
                {ringCaption({ hasGoal, over: overBy > 0, day, today })}
              </Typography>
            )}
            <Typography data-testid="calories-sentence" sx={{ fontSize: { xs: '1.0625rem', sm: '1.1875rem' }, fontWeight: 600, lineHeight: 1.3 }}>
              {headline}
            </Typography>
            <Typography sx={{ mt: 1, fontSize: '0.9375rem', color: 'text.secondary', lineHeight: 1.4 }}>
              {detail}
            </Typography>
          </Box>
        </Box>
      )}
      {offer}
      {note}

      {children && (
        <Box sx={{ mt: 3, mx: { xs: -2, sm: -2 } }}>
          <Button
            fullWidth
            onClick={toggle}
            aria-expanded={open}
            aria-controls="today-details"
            data-testid="macros-details-toggle"
            endIcon={(
              <ExpandIcon
                aria-hidden
                sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
              />
            )}
            sx={{ minHeight: 44, px: 2, justifyContent: 'space-between', color: 'text.primary', fontSize: '0.9375rem', fontWeight: 600, textTransform: 'none' }}
          >
            Protein, carbs and fat
          </Button>
          <Collapse in={open} unmountOnExit>
            <Box id="today-details" data-testid="today-details" sx={{ px: 2, pt: 3, pb: 1 }}>
              {children}
            </Box>
          </Collapse>
        </Box>
      )}
    </Surface>
  );
}
