/**
 * A facet big enough to need its own shape (GameGeek's ~90 tags, a book
 * collection's tags or authors): the most common `limit` show first, grouped
 * under headings the app supplies; "Show all" opens the rest in the same
 * groups; typing searches every value. A selected value is always on screen.
 *
 *   groupOf(value) → group name, groupOrder → the headings in order (the
 *   last one catches anything else), groupLabel(group) → the group's
 *   accessible name, itemNoun → { one: 'tag', many: 'tags' } for the search
 *   box and "Show all 24 tags". Without groupOf the options are one
 *   unlabelled list.
 *
 *   collapsedGroups → headings (from groupOrder) whose options sit folded
 *   behind a disclosure row at the end ("Unsorted · 212"): outside the
 *   `limit` and "Show all", listed whole once opened. A selected value in a
 *   folded group still shows under its heading, and a search looks inside
 *   folded groups too. Empty (the default) changes nothing.
 */
import React, { useId, useState } from 'react';
import { Box, ButtonBase, IconButton, InputBase, alpha } from '@mui/material';
import { Close as CloseIcon, ExpandMore as ExpandMoreIcon, Search as SearchIcon } from '@mui/icons-material';
import { groupOptions, visibleOptions } from '../facets/options';
import { OptionRow, ShowMoreButton } from './FacetOptions';

const DEFAULT_NOUN = { one: 'value', many: 'values' };
const NO_GROUPS = [];

const headingSx = { px: 1, pt: 0.5, pb: 0.25, fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' };

/** A folded group's heading: a disclosure row that says how many it holds. */
function FoldedGroupToggle({ group, count, open, controls, noun, onClick }) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-expanded={open ? 'true' : 'false'}
      aria-controls={controls}
      aria-label={`${group}, ${count} ${count === 1 ? noun.one : noun.many}`}
      sx={{
        ...headingSx,
        pt: 0,
        pb: 0,
        width: '100%',
        minHeight: { xs: 44, md: 34 },
        justifyContent: 'flex-start',
        gap: 0.75,
        borderRadius: '8px',
        '&:hover': { color: 'text.primary' },
        '&.Mui-focusVisible': { outline: 2, outlineColor: 'primary.main', outlineStyle: 'solid', outlineOffset: -2 },
      }}
    >
      <Box component="span">{group}</Box>
      <Box component="span" sx={{ fontWeight: 400, letterSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>
        {count}
      </Box>
      <ExpandMoreIcon aria-hidden="true" sx={{ fontSize: 18, ml: 'auto', transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none' }} />
    </ButtonBase>
  );
}

export default function GroupedFacetOptions({
  options,
  limit = 12,
  onChange,
  groupOf,
  groupOrder = [],
  groupLabel = (g) => g,
  itemNoun = DEFAULT_NOUN,
  emptyText = 'Nothing here yet.',
  collapsedGroups = NO_GROUPS,
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [openFolds, setOpenFolds] = useState(() => new Set());
  const inputId = useId();
  const foldId = useId();

  if (!options.length) {
    return <Box sx={{ px: 1, py: 0.5, fontSize: '0.8125rem', color: 'text.secondary', lineHeight: 1.5 }}>{emptyText}</Box>;
  }

  const q = query.trim().toLowerCase();
  const grouped = Boolean(groupOf && groupOrder.length);
  const foldable = grouped ? collapsedGroups.filter((g) => groupOrder.includes(g)) : NO_GROUPS;
  // The group a value lands in, exactly as groupOptions places it.
  const placed = (value) => {
    const g = groupOf(value);
    return groupOrder.includes(g) ? g : groupOrder[groupOrder.length - 1];
  };
  const folded = foldable.length ? options.filter((o) => foldable.includes(placed(o.value))) : NO_GROUPS;
  const main = folded.length ? options.filter((o) => !folded.includes(o)) : options;

  const pool = q ? options.filter((o) => o.selected || o.label.toLowerCase().includes(q)) : visibleOptions(main, limit, expanded);
  const groups = grouped ? groupOptions(pool, groupOf, groupOrder) : pool.length ? [{ group: null, options: pool }] : [];
  // Folded groups, when not searching: each with every option it holds.
  const folds = !q && folded.length
    ? foldable.map((group) => ({ group, options: folded.filter((o) => placed(o.value) === group) })).filter((f) => f.options.length)
    : NO_GROUPS;
  const toggleFold = (group) =>
    setOpenFolds((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  return (
    <Box>
      {options.length > limit ? (
        <Box
          sx={{
            mx: 1,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            pl: 1,
            minHeight: { xs: 44, md: 36 },
            borderRadius: '8px',
            border: 1,
            borderColor: 'border',
            bgcolor: 'background.paper',
            '&:focus-within': { borderColor: 'primary.main', boxShadow: (t) => `0 0 0 3px ${alpha(t.palette.primary.main, 0.18)}` },
          }}
        >
          <SearchIcon aria-hidden="true" sx={{ fontSize: 18, color: 'text.secondary' }} />
          <InputBase
            id={inputId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${options.length} ${itemNoun.many}`}
            inputProps={{ 'aria-label': `Search ${itemNoun.many}`, type: 'search' }}
            sx={{
              flex: 1,
              fontSize: { xs: '1rem', md: '0.875rem' },
              '& .MuiInputBase-input': { height: { xs: 44, md: 36 }, py: 0, boxSizing: 'border-box' },
              '& input::placeholder': { color: 'text.secondary', opacity: 1 },
              '& input[type="search"]::-webkit-search-cancel-button': { WebkitAppearance: 'none', display: 'none' },
            }}
          />
          {query ? (
            <IconButton aria-label={`Clear ${itemNoun.one} search`} onClick={() => setQuery('')} sx={{ width: 44, height: 44, m: -0.5 }}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          ) : null}
        </Box>
      ) : null}

      {groups.length || folds.length ? (
        groups.map(({ group, options: groupOptionsList }) => (
          <Box key={group ?? 'all'} role="group" aria-label={group == null ? undefined : groupLabel(group)} sx={{ '& + &': { mt: 1 } }}>
            {group != null ? (
              <Box aria-hidden="true" sx={headingSx}>
                {group}
              </Box>
            ) : null}
            {groupOptionsList.map((o) => (
              <OptionRow key={o.value} option={o} onChange={onChange} />
            ))}
          </Box>
        ))
      ) : (
        <Box sx={{ px: 1, py: 0.5, fontSize: '0.8125rem', color: 'text.secondary' }}>
          No {itemNoun.one} matches “{query.trim()}”.
        </Box>
      )}

      {!q && main.length > limit ? (
        <ShowMoreButton expanded={expanded} total={main.length} noun={itemNoun.many} onClick={() => setExpanded((v) => !v)} />
      ) : null}

      {folds.map(({ group, options: foldOptions }, i) => {
        const open = openFolds.has(group);
        const shown = open ? foldOptions : foldOptions.filter((o) => o.selected);
        const listId = `${foldId}-${i}`;
        return (
          <Box key={group} sx={{ mt: 1 }}>
            <FoldedGroupToggle
              group={group}
              count={foldOptions.length}
              open={open}
              controls={listId}
              noun={itemNoun}
              onClick={() => toggleFold(group)}
            />
            <Box id={listId} role="group" aria-label={groupLabel(group)}>
              {shown.map((o) => (
                <OptionRow key={o.value} option={o} onChange={onChange} />
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
