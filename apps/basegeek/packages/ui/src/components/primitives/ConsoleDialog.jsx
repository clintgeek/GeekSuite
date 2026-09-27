import Box from '@mui/material/Box';
import { GeekDialog } from '@geeksuite/ui';
import { Dymo } from '../../signalbox/Labels';

/**
 * ConsoleDialog — baseGeek's repeated dialog identity over `GeekDialog`
 * (DOCS/MOBILE_UI_PLAN.md §4 "basegeek"). The primitive already owns the
 * mobile rule (full-screen below `sm`, a header of close ✕ / title / primary
 * action); this file supplies only the Signal Box look every form dialog
 * in this app shares: an optional dymo-tape eyebrow over the title, the same
 * tape the sidebar and the panels are labelled with.
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
      <Box sx={{ mb: 0.75, lineHeight: 1 }}><Dymo tilt={false}>{eyebrow}</Dymo></Box>
      {title}
    </Box>
  ) : title;

  return <GeekDialog {...rest} title={titleNode} />;
}
