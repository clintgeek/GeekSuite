/**
 * HelpSheet — the whole grammar and every key on one card. Opened by the `?`
 * beside the add box and by the `?` key.
 */
import { Box, Button, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { GeekSheet } from '@geeksuite/ui';
import { penOf } from '../../theme/pen';

const GRAMMAR = [
  ['tomorrow  friday  next week', 'a date, at the start or the end'],
  ['/tomorrow  /fri  /mar 15', 'a date, anywhere'],
  ['2pm  14:30', 'a time, after the date'],
  ['#work  #home/garage', 'a tag; / nests. #GeekSuite saves as geek-suite'],
  ['!high  !medium  !low', 'priority'],
  ['^remember the badge', 'a note (last)'],
  ['$^draft text', 'a note saved to NoteGeek (last)'],
  ['@  -  ?  !', 'first character: event, note, question, important'],
  ['(daily)  (weekly)  (monthly)', 'repeats'],
  ['(private)', 'private: hidden until you tap it'],
];

const KEYS = [
  ['j  k', 'down, up'],
  ['x', 'done'],
  ['t', 'tomorrow'],
  ['d', 'pick a date'],
  ['e  Enter', 'edit'],
  ['Alt ↑  Alt ↓', 'move it up, down (Today)'],
  ['Esc', 'hide private tasks again'],
  ['/', 'the add box, or search'],
  ['g t  g u  g d  g s', 'Today, Upcoming, Done, Search'],
];

// What the marks on a row mean (priority was a bare bar with no legend).
const MARKS = [
  ['red bar, full height', 'high priority'],
  ['red bar, half height', 'medium priority'],
  ['short grey bar', 'low priority'],
  ['–  note    @  event', 'written down, not ticked; not counted as to do'],
  ['?  !  >  <', 'question, important, migrated, scheduled'],
  ['red words, “2 days late”', 'carried over from an earlier day'],
  ['“9am · passed”', 'timed earlier today and still open'],
];

const SWIPES = [
  ['swipe right', 'done'],
  ['swipe left', 'tomorrow'],
  ['long swipe left', 'pick a date'],
  ['Reorder, then hold ⋮⋮ and drag', 'put Today in your own order'],
];

function Table({ title, rows }) {
  const theme = useTheme();
  const p = penOf(theme);
  return (
    <Box component="section" sx={{ mb: 5 }}>
      <Typography component="h3" sx={{ fontSize: '0.9375rem', fontWeight: 700, pb: 1, mb: 1, borderBottom: `1px solid ${p.ink}` }}>{title}</Typography>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: 4 }}>
        {rows.map(([k, v]) => (
          <Box key={k} sx={{ display: 'contents' }}>
            <Box component="dt" sx={{ py: 1.5, fontWeight: 600, color: p.ink, whiteSpace: 'pre-wrap', borderBottom: `1px solid ${p.rule}` }}>{k}</Box>
            <Box component="dd" sx={{ m: 0, py: 1.5, color: p.grey, borderBottom: `1px solid ${p.rule}` }}>{v}</Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default function HelpSheet({ open, onClose }) {
  // A phone is not shown keyboard keys; a desktop is not shown swipes. A
  // tablet with a keyboard or a trackpad is shown both.
  const hasKeys = useMediaQuery('(any-hover: hover) and (any-pointer: fine)');
  const hasTouch = useMediaQuery('(any-pointer: coarse)');
  return (
    <GeekSheet open={open} onClose={onClose} title="Writing a task" description="Type it the way you would say it. Enter adds it." maxWidth="sm" snap="full">
      <Table title="In the add box" rows={GRAMMAR} />
      <Table title="On a row" rows={MARKS} />
      {hasKeys && <Table title="Keys" rows={KEYS} />}
      {(hasTouch || !hasKeys) && <Table title="Touch" rows={SWIPES} />}
      <Box sx={{ pb: 2 }}>
        <Button variant="contained" onClick={onClose} sx={{ minHeight: 44, px: 5 }}>Got it</Button>
      </Box>
    </GeekSheet>
  );
}
