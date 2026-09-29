/**
 * Upcoming — a timetable of the next 14 days, then "Later" by month
 * (DOCS/SIMPLE_PLAN.md § "Three views", Identity item 9). Big day numerals in
 * the left column, the day's tasks to the right; a day with nothing on it is
 * not shown at all.
 */
import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { differenceInCalendarDays, format } from 'date-fns';
import { usePen } from '../context/PenContext';
import { penOf } from '../theme/pen';
import TagChips from '../components/pen/TagChips';
import PenPage, { PenLoading } from '../components/pen/PenPage';
import usePenRows from '../components/pen/usePenRows';
import { EmptyLine, PageTitle, SectionCaption } from '../components/pen/PenHeadings';
import { UPCOMING_DAYS, upcomingGroups } from '../utils/penViews';

function DayNumeral({ date, now, showMonth, p }) {
  const diff = differenceInCalendarDays(date, now);
  const word = diff === 1 ? 'Tomorrow' : format(date, 'EEE');
  return (
    <Box sx={{ width: { xs: 52, sm: 88 }, flexShrink: 0, pt: 2, pb: 3 }}>
      <Typography component="h2" aria-label={`${diff === 1 ? 'Tomorrow, ' : ''}${format(date, 'EEEE d MMMM')}`} sx={{ m: 0, lineHeight: 1 }}>
        <Box component="span" sx={{ display: 'block', fontSize: { xs: '2.25rem', sm: '2.75rem' }, fontWeight: 700, letterSpacing: '-0.05em', color: p.ink }}>
          {format(date, 'd')}
        </Box>
        <Box component="span" sx={{ display: 'block', mt: 1, fontSize: '0.875rem', fontWeight: 600, color: diff === 1 ? p.ink : p.grey }}>
          {word}{showMonth ? ` · ${format(date, 'MMM')}` : ''}
        </Box>
      </Typography>
    </Box>
  );
}

const UpcomingPage = () => {
  const pen = usePen();
  const theme = useTheme();
  const p = penOf(theme);
  const groups = useMemo(() => upcomingGroups(pen.visible, pen.now), [pen.visible, pen.now]);
  const order = useMemo(
    () => [...groups.days.flatMap((d) => d.tasks), ...groups.later.flatMap((m) => m.tasks)],
    [groups],
  );
  const { renderRow, sheet } = usePenRows(order);
  const total = order.length;

  return (
    <PenPage>
      <PageTitle aside={pen.loaded ? `${total} coming up` : null}>Upcoming</PageTitle>
      <Box sx={{ pb: 4 }}><TagChips /></Box>

      {!pen.loaded ? <PenLoading /> : (
        <>
          {groups.days.length === 0 && groups.later.length === 0 && (
            <EmptyLine>Nothing ahead. Add a date to a task with “tomorrow” or “/friday”.</EmptyLine>
          )}
          {groups.days.length > 0 && (
            <Box component="section" aria-label={`Next ${UPCOMING_DAYS} days`} sx={{ borderTop: `1px solid ${p.ink}` }}>
              {groups.days.map((day, i) => (
                <Box key={day.key} sx={{ display: 'flex', borderBottom: `1px solid ${p.ink}` }}>
                  <DayNumeral
                    date={day.date}
                    now={pen.now}
                    // The month is named where it turns: on the first row of a
                    // new month, not on every row of it.
                    showMonth={day.date.getMonth() !== (i ? groups.days[i - 1].date : pen.now).getMonth()}
                    p={p}
                  />
                  <Box component="ul" sx={{ m: 0, p: 0, flex: 1, minWidth: 0, '& > li:last-of-type': { borderBottom: 0 } }}>
                    {day.tasks.map((t) => renderRow(t, { context: 'day' }))}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
          {groups.later.map((month) => (
            <Box key={month.key} component="section" aria-labelledby={`later-${month.key}`}>
              <SectionCaption id={`later-${month.key}`}>
                {groups.later[0].key === month.key ? 'Later · ' : ''}
                {format(month.date, month.date.getFullYear() === pen.now.getFullYear() ? 'MMMM' : 'MMMM yyyy')}
              </SectionCaption>
              <Box component="ul" sx={{ m: 0, p: 0 }}>{month.tasks.map((t) => renderRow(t))}</Box>
            </Box>
          ))}
        </>
      )}
      {sheet}
    </PenPage>
  );
};

export default UpcomingPage;
