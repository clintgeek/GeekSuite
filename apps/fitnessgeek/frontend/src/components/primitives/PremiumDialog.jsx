import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { GeekDialog, useGeekDialogFullScreen } from '@geeksuite/ui';
import SectionLabel from './SectionLabel.jsx';
import DisplayHeading from './DisplayHeading.jsx';

/**
 * PremiumDialog — the canonical FitnessGeek dialog wrapper.
 *
 * Now a thin skin over `GeekDialog` (MOBILE_UI_PLAN.md §2): the primitive owns
 * the rule — full-screen below `sm`, header of close ✕ / title / primary
 * action — and this wrapper owns the identity: the uppercase eyebrow, the DM
 * Serif Display title, and the dashed rules above and below the body. It used
 * to fake full-screen with `xs` margins and a `100vh` cap, which left an
 * unscrollable page behind a card on a phone.
 *
 * The header, footer and paper are styled through `headerSx` / `sx` and the
 * primitive's `data-geek-dialog` hooks rather than by re-implementing MUI's
 * `Dialog`, so the mobile rule is inherited, not copied.
 *
 * Props (all of the original API, plus the two mobile-header slots):
 *   open, onClose, maxWidth, fullWidth — passed through to GeekDialog
 *   eyebrow                            — small uppercase tick label
 *   title                              — DM Serif Display heading
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

  const dashed = `1px dashed ${theme.palette.divider}`;
  const footerTint = theme.palette.mode === 'dark'
    ? 'rgba(255,255,255,0.02)'
    : 'rgba(0,0,0,0.015)';

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
            borderRadius: '50%',
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
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
        borderBottom: dashed,
        ...headerSx,
      }}
      bodySx={{
        px: { xs: 3, sm: 3.5 },
        py: { xs: 2.5, sm: 3 },
        ...contentSx,
      }}
      sx={{
        borderRadius: { xs: 0, sm: 3 },
        border: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
        backgroundImage: 'none',
        boxShadow: theme.palette.mode === 'dark'
          ? '0 24px 64px -16px rgba(0, 0, 0, 0.7)'
          : '0 24px 64px -20px rgba(28, 25, 23, 0.25)',
        // Dashed rules are the identity; the primitive draws solid ones.
        '& [data-geek-dialog="header"]': { borderBottomStyle: 'dashed' },
        '& [data-geek-dialog="title"]': { overflow: 'visible' },
        // Window mode has no header band of its own; the dashed rule under the
        // title is what makes it read as the same dialog as the phone's.
        '& .MuiDialogTitle-root[data-geek-dialog="title"]': {
          alignItems: 'flex-start',
          px: { xs: 3, sm: 3.5 },
          pt: { xs: 3, sm: 3.5 },
          pb: { xs: 2, sm: 2.5 },
          borderBottom: dashed,
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
          borderTop: dashed,
          backgroundColor: footerTint,
          gap: 1,
        },
        '& [data-geek-dialog="actions"]': {
          px: { xs: 3, sm: 3.5 },
          py: { xs: 2, sm: 2.5 },
          borderTop: dashed,
          backgroundColor: footerTint,
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
