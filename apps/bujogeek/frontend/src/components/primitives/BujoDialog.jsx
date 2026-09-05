import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { GeekDialog } from '@geeksuite/ui';
import { colors } from '../../theme/colors';

/**
 * BujoDialog — the canonical BuJoGeek form dialog, a skin over `GeekDialog`.
 *
 * The primitive owns the rule (MOBILE_UI_PLAN.md §2): full-screen below `sm`
 * with a header of close ✕ / title / primary action, the familiar window at
 * `sm`+. This wrapper owns the identity every bujogeek dialog was
 * hand-rolling five times over: the italic Fraunces eyebrow, the Fraunces
 * serif title, dotted rules above and below the body, radius 3 on the paper,
 * and the barely-there footer tint.
 *
 * Props:
 *   open, onClose               — passed through
 *   eyebrow                     — italic Fraunces caption above the title
 *   title                       — Fraunces serif heading
 *   primaryAction               — the save/confirm button. Header-right below
 *                                 `sm`, footer at `sm`+.
 *   secondaryAction             — Cancel (and anything that must sit beside
 *                                 it). The ✕ replaces it below `sm` unless
 *                                 `keepSecondaryOnMobile`.
 *   keepSecondaryOnMobile       — keep the footer in full-screen mode, for the
 *                                 dialogs whose footer carries a real action
 *                                 (Delete, Save as Note) and not just Cancel.
 *   maxWidth, fullWidth         — window-mode sizing
 *   contentSx                   — sx overrides on the body
 *   children                    — the form
 *
 * Forms live in the body while the primary button lives in the header, so a
 * consumer gives its `<form>` an `id` and its primary button
 * `type="submit" form={thatId}` — the HTML `form` attribute associates the
 * two across the DOM, and Enter-to-submit keeps working.
 */
const BujoDialog = ({
  open,
  onClose,
  eyebrow,
  title,
  primaryAction,
  secondaryAction,
  keepSecondaryOnMobile = false,
  maxWidth = 'sm',
  fullWidth = true,
  contentSx,
  headerSx,
  disableClose = false,
  children,
  ...rest
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const captionInk = isDark ? 'rgba(255,255,255,0.32)' : colors.ink[300];
  const dottedRule = `1px dotted ${isDark ? 'rgba(255,255,255,0.14)' : colors.ink[200]}`;
  const footerTint = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)';

  const titleNode = (title || eyebrow) ? (
    <Box sx={{ minWidth: 0, whiteSpace: 'normal' }}>
      {eyebrow && (
        <Typography
          sx={{
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            fontSize: '0.8125rem',
            fontWeight: 400,
            color: captionInk,
            letterSpacing: '0.01em',
            lineHeight: 1.2,
            mb: 0.25,
          }}
        >
          {eyebrow}
        </Typography>
      )}
      {title && (
        <Typography
          component="span"
          sx={{
            display: 'block',
            fontFamily: '"Fraunces", serif',
            fontSize: { xs: '1.25rem', sm: '1.5rem' },
            fontWeight: 500,
            color: theme.palette.text.primary,
            letterSpacing: '-0.01em',
            lineHeight: 1.15,
          }}
        >
          {title}
        </Typography>
      )}
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
      secondaryAction={secondaryAction}
      keepSecondaryOnMobile={keepSecondaryOnMobile}
      headerSx={{
        alignItems: 'center',
        py: 1,
        ...headerSx,
      }}
      bodySx={{
        px: { xs: 2.5, sm: 3.5 },
        py: { xs: 2.5, sm: 3 },
        ...contentSx,
      }}
      sx={{
        borderRadius: { xs: 0, sm: 3 },
        backgroundColor: theme.palette.background.paper,
        backgroundImage: 'none',
        // Dotted rules are the identity; the primitive draws solid ones.
        '& [data-geek-dialog="header"]': { borderBottom: dottedRule },
        // Window mode has no header band: the dotted rule under DialogTitle is
        // what makes it read as the same dialog as the phone's.
        '& .MuiDialogTitle-root[data-geek-dialog="title"]': {
          alignItems: 'flex-start',
          px: { xs: 2.5, sm: 3.5 },
          pt: { xs: 3, sm: 3.5 },
          pb: 2,
          borderBottom: dottedRule,
        },
        '& [data-geek-dialog="footer"]': {
          borderTop: dottedRule,
          backgroundColor: footerTint,
          gap: 1,
        },
        '& [data-geek-dialog="actions"]': {
          px: { xs: 2.5, sm: 3.5 },
          py: 2,
          borderTop: dottedRule,
          backgroundColor: footerTint,
          gap: 1,
        },
      }}
      dialogProps={rest}
    >
      {children}
    </GeekDialog>
  );
};

export default BujoDialog;
