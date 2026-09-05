import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { GeekDialog } from '@geeksuite/ui';

/**
 * ConsoleDialog — baseGeek's repeated dialog identity over `GeekDialog`
 * (DOCS/MOBILE_UI_PLAN.md §4 "basegeek"). The primitive already owns the
 * mobile rule (full-screen below `sm`, a header of close ✕ / title / primary
 * action); this file supplies only the Mission Control look every form
 * dialog in this app shares: an optional uppercase Geist Mono eyebrow over
 * the title, matching the console voice used in the sidebar and top bar.
 *
 * The dialog paper itself already carries the app's hairline border and
 * `background.paper` fill via the `MuiDialog` override in `theme.js` — this
 * skin does not need to re-derive that.
 *
 * Props: everything `GeekDialog` takes, plus:
 *   eyebrow   node   optional uppercase mono tag rendered above `title`
 *                     (e.g. "DATABASE", "USER", "API KEY")
 *
 * Use it like:
 *   <ConsoleDialog
 *     open={open}
 *     onClose={onClose}
 *     eyebrow="Database"
 *     title="Add database"
 *     primaryAction={<Button type="submit" form={formId} variant="contained">Add</Button>}
 *     secondaryAction={<Button onClick={onClose}>Cancel</Button>}
 *   >
 *     <form id={formId} onSubmit={handleSubmit}>…</form>
 *   </ConsoleDialog>
 */
export default function ConsoleDialog({ eyebrow, title, ...rest }) {
  const titleNode = eyebrow ? (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        component="span"
        sx={{
          display: 'block',
          fontFamily: '"Geist Mono", monospace',
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'text.secondary',
          mb: 0.25,
        }}
      >
        {eyebrow}
      </Typography>
      {title}
    </Box>
  ) : title;

  return <GeekDialog {...rest} title={titleNode} />;
}
