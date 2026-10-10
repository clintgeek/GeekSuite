/**
 * Search — every task, open or done, by its words, note or #tag. Open matches
 * first (soonest first), then what is done. The query lives in the URL (?q=),
 * so Back returns to it.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, InputAdornment, TextField } from '@mui/material';
import { Search } from 'lucide-react';
import { slashFocusProps } from '@geeksuite/ui';
import { usePen } from '../context/PenContext';
import TagChips from '../components/pen/TagChips';
import PenPage, { PenLoading } from '../components/pen/PenPage';
import usePenRows from '../components/pen/usePenRows';
import { EmptyLine, PageTitle, SectionCaption } from '../components/pen/PenHeadings';
import { searchTasks } from '../utils/penViews';

const SearchPage = () => {
  const pen = usePen();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const results = useMemo(() => searchTasks(pen.visible, query), [pen.visible, query]);
  const doneShown = useMemo(() => results.done.slice(0, 100), [results]);
  const order = useMemo(() => [...results.open, ...doneShown], [results, doneShown]);
  const { renderRow, sheet } = usePenRows(order);

  return (
    <PenPage>
      <PageTitle>Search</PageTitle>
      <Box sx={{ pb: 4, display: 'grid', gap: 3 }}>
        <TextField
          value={query}
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
          placeholder="Words, a note, or #tag"
          fullWidth
          autoFocus
          inputProps={{ 'aria-label': 'Search tasks', type: 'search', ...slashFocusProps(40) }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search size={18} aria-hidden /></InputAdornment> }}
        />
        <TagChips />
      </Box>

      {!pen.loaded ? <PenLoading /> : (
        <>
          {!query.trim() && <EmptyLine>Type to search every task, open or done.</EmptyLine>}
          {query.trim() && order.length === 0 && <EmptyLine>Nothing matches “{query.trim()}”.</EmptyLine>}
          {results.open.length > 0 && (
            <Box component="section" aria-labelledby="search-open">
              <SectionCaption id="search-open" aside={`${results.open.length}`}>To do</SectionCaption>
              <Box component="ul" sx={{ m: 0, p: 0 }}>{results.open.map((t) => renderRow(t, { context: 'any' }))}</Box>
            </Box>
          )}
          {results.done.length > 0 && (
            <Box component="section" aria-labelledby="search-done">
              <SectionCaption id="search-done" aside={`${results.done.length}`}>Done</SectionCaption>
              <Box component="ul" sx={{ m: 0, p: 0 }}>{doneShown.map((t) => renderRow(t, { context: 'done' }))}</Box>
            </Box>
          )}
        </>
      )}
      {sheet}
    </PenPage>
  );
};

export default SearchPage;
