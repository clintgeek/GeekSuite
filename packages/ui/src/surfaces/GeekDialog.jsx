/**
 * GeekDialog — thin wrapper over MUI `Dialog` that enforces one rule: any
 * form dialog is `fullScreen` below `sm`, with a sheet-style header (close ✕
 * left, title center-left, primary action right) instead of the desktop
 * `DialogTitle` + `DialogActions` arrangement. A form built against this
 * primitive needs one layout, not two.
 *
 * Full mode swallows `secondaryAction` — the ✕ is the cancel — unless the
 * caller opts into `keepSecondaryOnMobile`, in which case it renders as a
 * footer bar above the safe-area inset.
 *
 * `mode` defaults to `'auto'`, resolved via `useMediaQuery` (not the shell
 * context) because dialogs frequently render outside `GeekShell`.
 *
 * @mui/icons-material is not a dependency of this package; the close glyph is
 * inline SVG, same as `GeekTopBar`'s hamburger.
 *
 * Three slot rules the apps kept re-deriving (MOBILE_UI_PLAN.md §4b) now live
 * here:
 *
 *   - the full-mode primary slot is *compact by default* — a normal
 *     `<Button startIcon>` otherwise eats half of the 60px header. The slot
 *     hides the button's start icon and tightens its padding while keeping the
 *     44px touch target; `primaryActionSx` reopens it for a caller that wants
 *     the icon back or a different shape.
 *   - `headerSx` styles the full-mode header; window mode has no header, so
 *     identity styling used to reach `DialogTitle` only through `PaperProps`.
 *     `titleSx` is the window-mode counterpart.
 *   - a node `title` in full mode is not clipped: `noWrap` and the ellipsis go
 *     away and overflow stays visible, so an eyebrow-over-title block renders
 *     whole. The `h3` wrapper (and with it the `aria-labelledby` target and the
 *     `data-geek-dialog="title"` hook) stays either way.
 */
import { forwardRef, useId } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { geekLayout, geekShape } from '../designTokens.js';

/** Inline SVG — @mui/icons-material is not a peer dependency of this package. */
function CloseGlyph() {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      sx={{
        display: 'block',
        width: 20,
        height: 20,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.75,
        strokeLinecap: 'round',
      }}
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </Box>
  );
}

/**
 * The "full screen below `breakpoint`" threshold as a plain boolean, so
 * existing MUI `<Dialog>`s in apps can adopt the rule without rewriting to
 * this wrapper. Resolves to `false` under SSR (no `matchMedia`), same as any
 * other `useMediaQuery` consumer in this package.
 */
export function useGeekDialogFullScreen(breakpoint = 'sm') {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down(breakpoint));
}

export const GeekDialog = forwardRef(function GeekDialog(
  {
    open,
    onClose,
    title,
    children,
    primaryAction,
    secondaryAction,
    keepSecondaryOnMobile = false,
    mode = 'auto',
    fullScreenBelow = 'sm',
    maxWidth = 'sm',
    fullWidth = true,
    closeLabel = 'Close',
    disableClose = false,
    keepMounted = false,
    dialogProps,
    sx,
    headerSx,
    titleSx,
    primaryActionSx,
    bodySx,
  },
  ref
) {
  const titleId = useId();
  const autoFull = useGeekDialogFullScreen(fullScreenBelow);
  const full = mode === 'auto' ? autoFull : mode === 'full';
  // A string/number title is a headline the header may safely clip; anything
  // else is a composed block (eyebrow over title, a chip beside it) that must
  // not be.
  const plainTitle = typeof title === 'string' || typeof title === 'number';

  const handleClose = (event, reason) => {
    if (disableClose) return;
    onClose?.(event, reason);
  };

  return (
    <Dialog
      {...dialogProps}
      ref={ref}
      open={open}
      onClose={handleClose}
      fullScreen={full}
      maxWidth={full ? false : maxWidth}
      fullWidth={full ? false : fullWidth}
      keepMounted={keepMounted}
      disablePortal={typeof document === 'undefined'}
      aria-labelledby={titleId}
      data-geek-dialog="root"
      data-geek-dialog-mode={full ? 'full' : 'window'}
      PaperProps={{
        sx: {
          ...(full ? { borderRadius: 0, backgroundImage: 'none' } : {}),
          ...sx,
        },
      }}
    >
      {full ? (
        <>
          <Box
            data-geek-dialog="header"
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              minHeight: `${geekLayout.topBarHeight}px`,
              paddingTop: 'env(safe-area-inset-top)',
              px: 2,
              gap: 1,
              borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
              ...headerSx,
            }}
          >
            {!disableClose ? (
              <IconButton
                onClick={(event) => handleClose(event, 'closeClick')}
                aria-label={closeLabel}
                data-geek-dialog="close"
                sx={{
                  minWidth: geekLayout.minClickTarget,
                  minHeight: geekLayout.minClickTarget,
                  borderRadius: `${geekShape.radius.control}px`,
                }}
              >
                <CloseGlyph />
              </IconButton>
            ) : null}
            <Typography
              component="div"
              variant="h3"
              noWrap={plainTitle}
              id={titleId}
              data-geek-dialog="title"
              sx={{
                flex: 1,
                minWidth: 0,
                ...(plainTitle ? null : { overflow: 'visible' }),
              }}
            >
              {title}
            </Typography>
            {primaryAction ? (
              <Box
                data-geek-dialog="primary"
                sx={{
                  flexShrink: 0,
                  // Compact by default: the header is 60px, and a full-size
                  // contained button with a start icon takes half of it.
                  '& .MuiButton-startIcon': { display: 'none' },
                  '& .MuiButton-root': {
                    minHeight: geekLayout.minClickTarget,
                    px: 1.5,
                    py: 0.5,
                    fontSize: '0.875rem',
                    lineHeight: 1.4,
                  },
                  ...primaryActionSx,
                }}
              >
                {primaryAction}
              </Box>
            ) : null}
          </Box>
          <DialogContent
            data-geek-dialog="body"
            sx={{
              paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
              ...bodySx,
            }}
          >
            {children}
          </DialogContent>
          {keepSecondaryOnMobile && secondaryAction ? (
            <Box
              data-geek-dialog="footer"
              sx={{
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'flex-end',
                px: 2,
                py: 1.5,
                paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
                borderTop: (theme) => `1px solid ${theme.palette.divider}`,
              }}
            >
              {secondaryAction}
            </Box>
          ) : null}
        </>
      ) : (
        <>
          <DialogTitle
            id={titleId}
            data-geek-dialog="title"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6, ...titleSx }}
          >
            {title}
            {!disableClose ? (
              <IconButton
                onClick={(event) => handleClose(event, 'closeClick')}
                aria-label={closeLabel}
                data-geek-dialog="close"
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  minWidth: geekLayout.minClickTarget,
                  minHeight: geekLayout.minClickTarget,
                  borderRadius: `${geekShape.radius.control}px`,
                }}
              >
                <CloseGlyph />
              </IconButton>
            ) : null}
          </DialogTitle>
          <DialogContent data-geek-dialog="body" sx={bodySx}>
            {children}
          </DialogContent>
          {secondaryAction || primaryAction ? (
            <DialogActions data-geek-dialog="actions" sx={{ px: 3, pb: 2 }}>
              {secondaryAction}
              {primaryAction}
            </DialogActions>
          ) : null}
        </>
      )}
    </Dialog>
  );
});
