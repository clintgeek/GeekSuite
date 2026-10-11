/**
 * A source's priority for this reader (NewsSource.priorityForMe, plan
 * "Ranking: the briefing"): ★ Favorite / Normal / Less, one segmented
 * control. Favorites lead their section on Today; Less sinks a source
 * without hiding it ("In my paper" is the way to hide one).
 *
 * Three 44px buttons in a row (aria-pressed, keyboard-reachable, labelled as
 * a group); the chosen one is ink on newsprint, reversed — no colour does the
 * work. The choice moves at once (optimistic) and snaps back with a toast if
 * the gateway refuses. After a write `onChanged` drops the cached front page
 * and lists (cachePolicies.resetArticleLists), because priority changes Today.
 */
import React from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useMutation } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import { SET_NEWS_SOURCE_PRIORITY } from '../graphql/mutations';
import { GOTHIC, flagSx } from '../theme/theme';

export const PRIORITIES = [
  { value: 'favorite', label: '★ Favorite', name: 'Favorite' },
  { value: 'normal', label: 'Normal', name: 'Normal' },
  { value: 'less', label: 'Less', name: 'Less' },
];
export const PRIORITY_HELP = 'Favorites lead their section on Today. Less sinks a source without hiding it.';

export default function PriorityControl({ source, onChanged, disabled = false, sx }) {
  const { notify } = useToast();
  const [setPriority, { loading }] = useMutation(SET_NEWS_SOURCE_PRIORITY);
  const value = source.priorityForMe || 'normal';
  const labelId = `priority-${source.id}`;

  const change = async (_, next) => {
    if (!next || next === value) return;
    try {
      await setPriority({
        variables: { id: source.id, priority: next },
        optimisticResponse: { newsSetSourcePriority: { __typename: 'NewsSource', id: source.id, priorityForMe: next } },
      });
      onChanged?.(next);
    } catch {
      notify(`Couldn’t change ${source.name}’s priority. Try again.`, { tone: 'error' });
    }
  };

  return (
    <Box data-testid="priority-control" sx={{ py: 3, ...sx }}>
      <Typography id={labelId} component="p" sx={{ ...flagSx, color: 'text.primary', mb: 2 }}>
        Priority on Today
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={value}
        onChange={change}
        disabled={disabled || loading}
        aria-labelledby={labelId}
        sx={{
          '& .MuiToggleButton-root': {
            minHeight: 44,
            fontFamily: GOTHIC,
            fontSize: '0.9375rem',
            fontWeight: 600,
            textTransform: 'none',
            letterSpacing: 0,
            color: 'text.primary',
            borderColor: 'text.primary',
            borderRadius: '2px',
            '&:hover': { bgcolor: 'background.shade' },
            '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'text.primary', color: 'background.default' },
            '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: 2, zIndex: 1 },
            '&.Mui-disabled': { color: 'text.secondary', borderColor: 'divider' },
            '&.Mui-selected.Mui-disabled': { bgcolor: 'background.shade', color: 'text.primary' },
          },
        }}
      >
        {PRIORITIES.map((p) => (
          <ToggleButton key={p.value} value={p.value} aria-label={p.name} data-priority={p.value}>
            {p.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Typography sx={{ fontFamily: GOTHIC, fontSize: '0.8125rem', lineHeight: 1.4, color: 'text.secondary', mt: 2 }}>{PRIORITY_HELP}</Typography>
    </Box>
  );
}
