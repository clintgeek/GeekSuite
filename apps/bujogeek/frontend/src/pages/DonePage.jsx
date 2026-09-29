/**
 * Done — what got crossed off, by day, newest first; searchable; one tap on a
 * row's square puts it back on the list (with Undo). DOCS/SIMPLE_PLAN.md §
 * "Three views".
 */
import { useMemo, useState } from 'react';
import { Box, Button, InputAdornment, TextField } from '@mui/material';
import { Search } from 'lucide-react';
import { usePen } from '../context/PenContext';
import TagChips from '../components/pen/TagChips';
import PenPage, { PenLoading } from '../components/pen/PenPage';
import usePenRows from '../components/pen/usePenRows';
import { EmptyLine, PageTitle, SectionCaption } from '../components/pen/PenHeadings';
import { dayTitle, doneGroups, limitGroups } from '../utils/penViews';

const PAGE = 60;

const DonePage = () => {
  const pen = usePen();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const groups = useMemo(() => doneGroups(pen.visible, query), [pen.visible, query]);
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  const shown = useMemo(() => limitGroups(groups, limit), [groups, limit]);
  const order = useMemo(() => shown.flatMap((g) => g.tasks), [shown]);
  const { renderRow, sheet } = usePenRows(order);

  return (
    <PenPage>
      <PageTitle aside={pen.loaded ? `${total} crossed off` : null}>Done</PageTitle>
      <Box sx={{ pb: 4, display: 'grid', gap: 3 }}>
        <TextField
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
          placeholder="Search what’s done"
          size="small"
          fullWidth
          inputProps={{ 'aria-label': 'Search done tasks', type: 'search' }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search size={18} aria-hidden /></InputAdornment> }}
        />
        <TagChips />
      </Box>

      {!pen.loaded ? <PenLoading /> : (
        <>
          {total === 0 && <EmptyLine>{query ? `Nothing done matches “${query}”.` : 'Nothing crossed off yet.'}</EmptyLine>}
          {shown.map((g) => (
            <Box key={g.key} component="section" aria-labelledby={`done-${g.key}`}>
              <SectionCaption id={`done-${g.key}`} aside={`${groups.find((x) => x.key === g.key)?.tasks.length ?? g.tasks.length}`}>
                {dayTitle(g.date, pen.now)}
              </SectionCaption>
              <Box component="ul" sx={{ m: 0, p: 0 }}>{g.tasks.map((t) => renderRow(t, { context: 'done' }))}</Box>
            </Box>
          ))}
          {total > limit && (
            <Box sx={{ pt: 5 }}>
              <Button onClick={() => setLimit((l) => l + PAGE)} sx={{ minHeight: 44, color: 'text.primary', textDecoration: 'underline' }}>
                Show {Math.min(PAGE, total - limit)} more
              </Button>
            </Box>
          )}
        </>
      )}
      {sheet}
    </PenPage>
  );
};

export default DonePage;
