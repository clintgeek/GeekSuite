import { forwardRef, useCallback, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { geekLayout, geekShape } from '../designTokens.js';

/**
 * The GeekSuite roster, in switcher order. This is the single source of truth
 * for "which apps exist and where do they live" — apps import it rather than
 * re-typing the list in their own chrome.
 *
 * `id` is the subdomain label, which is also how the current app is detected
 * from `window.location.hostname` when no `currentApp` prop is supplied.
 */
export const GEEKSUITE_APPS = [
  { id: 'basegeek', label: 'Mission Control', monogram: 'MC' },
  { id: 'notegeek', label: 'NoteGeek', monogram: 'NG' },
  { id: 'bujogeek', label: 'BujoGeek', monogram: 'BJ' },
  { id: 'fitnessgeek', label: 'FitnessGeek', monogram: 'FG' },
  { id: 'storygeek', label: 'StoryGeek', monogram: 'SG' },
  { id: 'flockgeek', label: 'FlockGeek', monogram: 'FL' },
  { id: 'bookgeek', label: 'BookGeek', monogram: 'BK' },
  { id: 'startgeek', label: 'Launcher', monogram: 'LA' },
].map((app) => ({ ...app, url: `https://${app.id}.clintgeek.com` }));

/** Nine-dot "apps" glyph. Inline SVG on purpose: @mui/icons-material is not a
 * peer dependency of this package, so shared chrome must not reach for it. */
function AppsGlyph() {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      sx={{ display: 'block', width: 20, height: 20, fill: 'currentColor' }}
    >
      {[5, 12, 19].map((cy) =>
        [5, 12, 19].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2" />)
      )}
    </Box>
  );
}

/** First label of the current hostname, e.g. `notegeek.clintgeek.com` -> `notegeek`. */
function hostnameApp() {
  if (typeof window === 'undefined') return undefined;
  const first = window.location?.hostname?.split('.')[0];
  return GEEKSUITE_APPS.some((app) => app.id === first) ? first : undefined;
}

/**
 * Suite app switcher: an icon button that opens a three-column grid of every
 * GeekSuite app. The app you are already in is highlighted and inert.
 *
 * @param {string} [currentApp] app id to mark as current; falls back to the
 *   hostname's first label.
 * @param {object} [anchorOrigin] override for hosts that mount the button
 *   somewhere other than the right edge of a top bar (e.g. a sidebar).
 */
export const GeekAppSwitcher = forwardRef(function GeekAppSwitcher(
  {
    currentApp,
    label = 'Switch app',
    anchorOrigin = { vertical: 'bottom', horizontal: 'right' },
    transformOrigin = { vertical: 'top', horizontal: 'right' },
    sx,
    ...props
  },
  ref
) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const activeId = useMemo(() => currentApp || hostnameApp(), [currentApp]);

  const handleOpen = useCallback((event) => setAnchorEl(event.currentTarget), []);
  const handleClose = useCallback(() => setAnchorEl(null), []);

  return (
    <>
      <Tooltip title={label}>
        <IconButton
          ref={ref}
          onClick={handleOpen}
          aria-label={label}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
          sx={{
            color: 'inherit',
            minWidth: geekLayout.minClickTarget,
            minHeight: geekLayout.minClickTarget,
            borderRadius: `${geekShape.radius.control}px`,
            ...sx,
          }}
          {...props}
        >
          <AppsGlyph />
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={anchorOrigin}
        transformOrigin={transformOrigin}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              borderRadius: `${geekShape.radius.panel}px`,
              border: (theme) => `1px solid ${theme.palette.divider}`,
              backgroundColor: 'background.paper',
              backgroundImage: 'none',
            },
          },
        }}
      >
        <Box
          role="menu"
          aria-label={label}
          sx={{
            p: 1,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(84px, 1fr))',
            gap: 0.5,
            width: 'max-content',
            maxWidth: '90vw',
          }}
        >
          {GEEKSUITE_APPS.map((app) => {
            const isCurrent = app.id === activeId;
            const tileSx = {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.75,
              px: 1,
              py: 1.25,
              width: '100%',
              minHeight: geekLayout.minClickTarget + 28,
              borderRadius: `${geekShape.radius.control}px`,
              color: 'text.primary',
              textDecoration: 'none',
              transition: (theme) =>
                theme.transitions.create(['background-color', 'color']),
            };

            const contents = (
              <>
                <Box
                  aria-hidden="true"
                  sx={{
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: `${geekShape.radius.chip}px`,
                    backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.12),
                    color: 'primary.main',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                  }}
                >
                  {app.monogram}
                </Box>
                <Typography
                  variant="caption"
                  noWrap
                  sx={{
                    maxWidth: '100%',
                    fontWeight: isCurrent ? 600 : 400,
                    color: isCurrent ? 'primary.main' : 'text.secondary',
                  }}
                >
                  {app.label}
                </Typography>
              </>
            );

            if (isCurrent) {
              return (
                <Box
                  key={app.id}
                  role="menuitem"
                  aria-current="page"
                  aria-disabled="true"
                  className="Mui-selected"
                  sx={{
                    ...tileSx,
                    cursor: 'default',
                    backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.12),
                  }}
                >
                  {contents}
                </Box>
              );
            }

            return (
              <ButtonBase
                key={app.id}
                component="a"
                href={app.url}
                role="menuitem"
                onClick={handleClose}
                sx={{
                  ...tileSx,
                  '&:hover': {
                    backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.06),
                  },
                }}
              >
                {contents}
              </ButtonBase>
            );
          })}
        </Box>
      </Popover>
    </>
  );
});
