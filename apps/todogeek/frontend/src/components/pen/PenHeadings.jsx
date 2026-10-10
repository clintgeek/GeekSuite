/**
 * The Red Pen headings: Today's desk-calendar date, and the plain section
 * captions every view uses.
 */
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { format } from 'date-fns';
import { penOf } from '../../theme/pen';
import { srOnly } from './penMarks';

/**
 * Today's header is a desk calendar (Identity item 8): a huge day number,
 * "Sunday · September" beside it, and one plain line of counts.
 */
export function DeskDate({ date, toDo, done }) {
  const theme = useTheme();
  const p = penOf(theme);
  const counts = [`${toDo} to do`, `${done} done`].join(' · ');
  return (
    <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: 4, pt: { xs: 5, md: 8 }, pb: 5 }}>
      <Typography
        component="h1"
        sx={{ fontSize: { xs: '4.5rem', md: '5.5rem' }, lineHeight: 0.9, fontWeight: 700, letterSpacing: '-0.055em', color: p.ink, minWidth: '1.2em' }}
      >
        <Box component="span" sx={srOnly}>
          Today, {format(date, 'EEEE d MMMM')}
        </Box>
        <span aria-hidden>{format(date, 'd')}</span>
      </Typography>
      <Box>
        <Typography aria-hidden sx={{ fontSize: { xs: '1.125rem', md: '1.25rem' }, fontWeight: 650, letterSpacing: '-0.01em', color: p.ink, lineHeight: 1.25 }}>
          {format(date, 'EEEE')} · {format(date, 'MMMM')}
        </Typography>
        <Typography sx={{ fontSize: '0.9375rem', color: p.grey, mt: 1 }}>{counts}</Typography>
      </Box>
    </Box>
  );
}

/** A page title for the views that are not Today. */
export function PageTitle({ children, aside }) {
  const theme = useTheme();
  const p = penOf(theme);
  return (
    <Box component="header" sx={{ display: 'flex', alignItems: 'baseline', gap: 3, pt: { xs: 5, md: 8 }, pb: 4 }}>
      <Typography component="h1" sx={{ fontSize: { xs: '2rem', md: '2.5rem' }, fontWeight: 700, letterSpacing: '-0.035em', color: p.ink, lineHeight: 1.05 }}>
        {children}
      </Typography>
      {aside && <Typography sx={{ fontSize: '0.9375rem', color: p.grey }}>{aside}</Typography>}
    </Box>
  );
}

/** A quiet section caption over a hairline: "Anytime", "Later". */
export function SectionCaption({ children, aside, id, sx }) {
  const theme = useTheme();
  const p = penOf(theme);
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, pt: 6, pb: 2, borderBottom: `1px solid ${p.ink}`, ...sx }}>
      <Typography id={id} component="h2" sx={{ fontSize: '0.9375rem', fontWeight: 700, color: p.ink }}>
        {children}
      </Typography>
      {aside && <Typography sx={{ fontSize: '0.875rem', color: p.grey }}>{aside}</Typography>}
    </Box>
  );
}

export function EmptyLine({ children }) {
  const theme = useTheme();
  const p = penOf(theme);
  return <Typography sx={{ py: 4, pl: 5, fontSize: '1rem', color: p.grey }}>{children}</Typography>;
}
