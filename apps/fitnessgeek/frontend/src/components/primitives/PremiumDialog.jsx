import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { GeekDialog, useGeekDialogFullScreen } from '@geeksuite/ui';
import SectionLabel from './SectionLabel.jsx';
import DisplayHeading from './DisplayHeading.jsx';

/**
 * PremiumDialog — the canonical FitnessGeek dialog wrapper.
 *
 * Now a thin skin over `GeekDialog` (MOBILE_UI_PLAN.md §2): the primitive owns
 * the rule — full-screen below `sm`, header of close ✕ / title / primary
 * action — and this wrapper owns the identity: the eyebrow, the bold title, and a hairline
 * under the header and above the actions. It used
 * to fake full-screen with `xs` margins and a `100vh` cap, which left an
 * unscrollable page behind a card on a phone.
 *
 * The header, footer and paper are styled through `headerSx` / `sx` and the
 * primitive's `data-geek-dialog` hooks rather than by re-implementing MUI's
 * `Dialog`, so the mobile rule is inherited, not copied.
 *
 * Daylight: 16px paper corners (top corners only when full-screen), a bold
 * title over a divider hairline, and a hairline above the actions row.
 *
 * Props (all of the original API, plus the two mobile-header slots):
 *   open, onClose, maxWidth, fullWidth — passed through to GeekDialog
 *   eyebrow                            — small context label (a date or a meal
 *                                        only; never a second heading)
 *   title                              — the heavy display heading
 *   subtitle                           — optional muted body copy. Moves to the
 *                                        top of the body when full-screen, so
 *                                        the 60px header stays a header.
 *   icon                               — optional icon component in the header
 *   primaryAction                      — the save/confirm button. Header-right
 *                                        below `sm`, footer at `sm`+.
 *   secondaryAction                    — cancel-ish button; the ✕ replaces it
 *                                        below `sm`.
 *   actions                            — legacy: a whole footer node. Kept in
 *                                        the footer in both modes.
 *   children                           — dialog body
 *   contentSx                          — sx overrides on the content area
 *   disableClose                       — hide the ✕ (for required-action dialogs)
 *
 * Use it like:
 *   <PremiumDialog
 *     open={open}
 *     onClose={onClose}
 *     eyebrow="Confirm"
 *     title="Delete this meal?"
 *     subtitle="This can't be undone."
 *     primaryAction={<Button variant="contained" color="error" onClick={confirm}>Delete</Button>}
 *     secondaryAction={<Button onClick={onClose}>Cancel</Button>}
 *   >
 *     {body content}
 *   </PremiumDialog>
 */
const PremiumDialog = ({
  open,
  onClose,
  maxWidth = 'sm',
  fullWidth = true,
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  primaryAction,
  secondaryAction,
  actions,
  children,
  contentSx,
  headerSx,
  disableClose = false,
  ...rest
}) => {
  const theme = useTheme();
  const fullScreen = useGeekDialogFullScreen();

  const ink = theme.palette.text.primary;
  const mediumRule = `1px solid ${theme.palette.divider}`;
  const thinRule = `1px solid ${theme.palette.divider}`;

  const titleNode = (title || eyebrow || Icon || subtitle) ? (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.75,
        minWidth: 0,
        // The primitive's header title is `noWrap`; identity type wraps.
        whiteSpace: 'normal',
      }}
    >
      {Icon && (
        <Box
          sx={{
            width: { xs: 34, sm: 40 },
            height: { xs: 34, sm: 40 },
            borderRadius: '10px',
            backgroundColor: alpha(ink, theme.palette.mode === 'dark' ? 0.12 : 0.06),
            color: ink,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon sx={{ fontSize: 20 }} />
        </Box>
      )}
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && <SectionLabel sx={{ mb: 0.5 }}>{eyebrow}</SectionLabel>}
        {title && (
          <DisplayHeading
            size="card"
            sx={{ fontSize: { xs: '1.125rem', sm: '1.5rem' } }}
          >
            {title}
          </DisplayHeading>
        )}
        {subtitle && !fullScreen && (
          <Typography
            sx={{
              color: 'text.secondary',
              fontSize: '0.875rem',
              mt: 0.5,
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
  ) : null;

  return (
    <GeekDialog
      open={open}
      onClose={onClose}
      disableClose={disableClose}
      title={titleNode}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction ?? actions}
      keepSecondaryOnMobile={Boolean(actions) && !secondaryAction}
      headerSx={{
        alignItems: 'center',
        py: 1,
        borderBottom: mediumRule,
        ...headerSx,
      }}
      bodySx={{
        px: { xs: 4, sm: 5 },
        py: { xs: 2.5, sm: 3 },
        ...contentSx,
      }}
      sx={{
        borderRadius: fullScreen ? '16px 16px 0 0' : '16px',
        border: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
        backgroundImage: 'none',
        boxShadow: 'none',
        // Hairline under the header, matching the primitive's divider.
        '& [data-geek-dialog="header"]': { borderBottom: mediumRule },
        '& [data-geek-dialog="title"]': { overflow: 'visible' },
        '& .MuiDialogTitle-root[data-geek-dialog="title"]': {
          alignItems: 'flex-start',
          px: { xs: 4, sm: 5 },
          pt: { xs: 3, sm: 3.5 },
          pb: { xs: 2, sm: 2.5 },
          borderBottom: mediumRule,
        },
        // The full-screen header's primary action is text in a 60px bar, not a
        // full-size CTA: drop its start icon and tighten the padding so the
        // title keeps the room it needs. (`primary` only exists in full mode.)
        '& [data-geek-dialog="primary"] .MuiButton-startIcon': { display: 'none' },
        '& [data-geek-dialog="primary"] .MuiButton-root': {
          px: 1.75,
          minWidth: 'auto',
          whiteSpace: 'nowrap',
        },
        '& [data-geek-dialog="footer"]': {
          borderTop: thinRule,
          gap: 1,
        },
        '& [data-geek-dialog="actions"]': {
          px: { xs: 4, sm: 5 },
          py: { xs: 2, sm: 2.5 },
          borderTop: thinRule,
          gap: 1,
        },
      }}
      dialogProps={rest}
    >
      {subtitle && fullScreen && (
        <Typography
          sx={{
            color: 'text.secondary',
            fontSize: '0.875rem',
            mb: 2,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </Typography>
      )}
      {children}
    </GeekDialog>
  );
};

export default PremiumDialog;
