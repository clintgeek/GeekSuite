/**
 * TagChips — the pinned tags, one tap to filter any view (DOCS/SIMPLE_PLAN.md
 * § "Filters"). Tags are the only organisation BuJoGeek has left.
 *
 * Chef picks the pins ("Pin tags…" opens the list of every tag he has used,
 * most used first); they are stored per user in `appPreferences.bujogeek.
 * pinnedTags` (hooks/usePinnedTags.js), so they follow him between devices.
 * Which pin is ACTIVE is this session's, shared by every view.
 */
import { useState } from 'react';
import { Box, ButtonBase, Checkbox, FormControlLabel } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { GeekSheet } from '@geeksuite/ui';
import { penOf } from '../../theme/pen';
import { normalizeTag } from '@geeksuite/tags';
import usePinnedTags from '../../hooks/usePinnedTags';
import { usePen } from '../../context/PenContext';
import { tagCounts } from '../../utils/penViews';

function Chip({ active, onClick, children, ...rest }) {
  const theme = useTheme();
  const p = penOf(theme);
  return (
    <ButtonBase
      onClick={onClick}
      aria-pressed={active}
      {...rest}
      sx={{
        minHeight: 44,
        px: 3.5,
        borderRadius: '22px',
        fontSize: '0.9375rem',
        fontWeight: active ? 650 : 500,
        color: active ? p.paper : p.grey,
        backgroundColor: active ? p.ink : 'transparent',
        border: `1px solid ${active ? p.ink : p.rule}`,
        '@media (hover: hover)': { '&:hover': { borderColor: p.ink, color: active ? p.paper : p.ink } },
        '&.Mui-focusVisible': { outline: `2px solid ${p.ink}`, outlineOffset: 2 },
      }}
    >
      {children}
    </ButtonBase>
  );
}

export default function TagChips() {
  const { tagFilter, setTagFilter, corpus } = usePen();
  const { pinned, toggle } = usePinnedTags();
  const [picking, setPicking] = useState(false);
  const all = tagCounts(corpus);
  // Compared in the suite tag standard: a `geekSuite` filter is the `geek-suite` pin.
  const isOn = (tag) => tagFilter && normalizeTag(tagFilter) === normalizeTag(tag);

  return (
    <Box component="nav" aria-label="Filter by tag" sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
      {pinned.length > 0 && (
        <Chip active={!tagFilter} onClick={() => setTagFilter(null)}>All</Chip>
      )}
      {pinned.map((tag) => (
        <Chip key={tag} active={Boolean(isOn(tag))} onClick={() => setTagFilter(isOn(tag) ? null : tag)}>
          #{tag}
        </Chip>
      ))}
      {tagFilter && !pinned.some((t) => isOn(t)) && (
        <Chip active onClick={() => setTagFilter(null)}>#{tagFilter}</Chip>
      )}
      <ButtonBase
        onClick={() => setPicking(true)}
        sx={{ minHeight: 44, px: 2, fontSize: '0.9375rem', color: 'text.secondary', textDecoration: 'underline', textUnderlineOffset: '3px', borderRadius: '4px' }}
      >
        {pinned.length ? 'Pins…' : 'Pin tags…'}
      </ButtonBase>

      <GeekSheet open={picking} onClose={() => setPicking(false)} title="Pinned tags" description="Pinned tags sit above every view. One tap filters." maxWidth="xs">
        <Box sx={{ display: 'grid', pb: 2 }}>
          {all.length === 0 && <Box sx={{ color: 'text.secondary', py: 2 }}>No tags yet. Add one with #tag when you write a task.</Box>}
          {all.map((tag) => (
            <FormControlLabel
              key={tag}
              control={<Checkbox checked={pinned.includes(normalizeTag(tag))} onChange={() => toggle(tag)} />}
              label={`#${tag}`}
              sx={{ minHeight: 44, m: 0 }}
            />
          ))}
        </Box>
      </GeekSheet>
    </Box>
  );
}
