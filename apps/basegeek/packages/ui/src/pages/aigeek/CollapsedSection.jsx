/**
 * CollapsedSection — a section of the status page that starts closed.
 *
 * The two at the bottom, Catalog and Try it (§2), are both things a monthly
 * visit does not need: the catalog is maintained by the job, and Try it is a
 * diagnostic. Open by default they would push Needs attention's answer — the
 * reason the page exists — off the first screen.
 *
 * `unmountOnExit` on the body is not a nicety: the catalog table is a few
 * hundred rows of DOM and Try it holds a prompt box and a response pane, and
 * neither should cost anything on a visit that closes the tab.
 */
import {
  Box,
  Button,
  Card,
  CardContent,
  Collapse,
  Typography,
} from '@mui/material';
import { ExpandLess as ExpandLessIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';

export default function CollapsedSection({ id, title, description, open, onToggle, children }) {
  const bodyId = `${id}-body`;
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6">{title}</Typography>
            {description && (
              <Typography variant="body2" color="text.muted" sx={{ fontSize: 12 }}>
                {description}
              </Typography>
            )}
          </Box>
          <Button
            onClick={onToggle}
            aria-expanded={!!open}
            aria-controls={bodyId}
            endIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            sx={{ minHeight: 44, fontSize: 12 }}
          >
            {open ? 'Hide' : 'Show'}
          </Button>
        </Box>

        <Collapse in={!!open} unmountOnExit>
          <Box id={bodyId} sx={{ mt: 2 }}>{children}</Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}
