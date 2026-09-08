/**
 * StatusNav — the anchor nav across the top of the status page.
 *
 * Five tabs became one scrolling page (§2), which needs a way to get to the
 * bottom of it. This is that, and deliberately not a `<Tabs>`: tabs claim the
 * sections are alternatives, and they are not — they are one story read top to
 * bottom, and the whole point of the redesign is that "Needs attention is
 * empty" is visible without choosing anything.
 *
 * Scrolling, not routing. A hash change would re-render `AIGeekPage`, which
 * would throw away a status the admin is mid-read of and re-fire every fetch.
 * `scrollIntoView` on the section id is the whole mechanism; the sections
 * carry `scrollMarginTop` so they do not land under the shell's sticky bar.
 *
 * The Needs attention entry carries the count, because the count is the one
 * number worth seeing before you have scrolled anywhere.
 */
import { Badge, Box, Button } from '@mui/material';
import { SECTIONS } from './format';

export default function StatusNav({ attentionCount = 0, hasWarning = false, onJump }) {
  return (
    <Box
      component="nav"
      aria-label="Status page sections"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        display: 'flex',
        gap: 0.5,
        flexWrap: 'wrap',
        py: 1,
        mb: 2,
        // The page scrolls under this, so it needs its own ground rather than
        // borrowing whatever happens to be behind it.
        bgcolor: 'background.default',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      {SECTIONS.map(section => {
        const isAttention = section.id === 'needs-attention';
        const label = (
          <Badge
            color={hasWarning ? 'warning' : 'info'}
            badgeContent={isAttention ? attentionCount : 0}
            // A zero badge is noise on a page whose good state is zero.
            invisible={!isAttention || attentionCount === 0}
            sx={{ '& .MuiBadge-badge': { fontSize: 12, right: -6 } }}
          >
            {section.label}
          </Badge>
        );

        return (
          <Button
            key={section.id}
            size="small"
            onClick={() => onJump(section.id)}
            sx={{ minHeight: 44, fontSize: 12, px: 1.5 }}
          >
            {label}
          </Button>
        );
      })}
    </Box>
  );
}
