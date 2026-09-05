import { alpha, useTheme } from '@mui/material';
import { GeekDialog } from '@geeksuite/ui';

/**
 * CodexDialog — the canonical StoryGeek dialog, an Arcane Codex skin over
 * `GeekDialog`.
 *
 * The primitive owns the rule (MOBILE_UI_PLAN.md §2): full-screen below `sm`
 * with a header of close ✕ / title / primary action, and the familiar window
 * at `sm`+. This wrapper owns the identity all three of storygeek's dialogs
 * were hand-rolling — the Cinzel title, the gold hairlines under it and above
 * the footer, and the parchment/leather paper — so the codex voice lives in
 * one file instead of three copies of
 * `sx={{ fontFamily: '"Cinzel", serif' }}`.
 *
 * `mode="window"` keeps a dialog centred even on a phone; the delete confirm
 * uses it, because a two-line "are you sure" does not deserve the whole
 * screen.
 *
 * Below `sm` the primary button lives in the header while the form lives in
 * the body, so a consumer that wants Enter-to-submit gives its `<form>` an
 * `id` and the primary button `type="submit" form={thatId}`.
 */
export default function CodexDialog({
  open,
  onClose,
  title,
  primaryAction,
  secondaryAction,
  keepSecondaryOnMobile = false,
  mode = 'auto',
  maxWidth = 'sm',
  fullWidth = true,
  bodySx,
  dialogProps,
  children,
}) {
  const theme = useTheme();
  const gold = theme.palette.codex?.gold || '#c9a84c';
  const hairline = `1px solid ${alpha(gold, 0.2)}`;
  const codexTitle = {
    fontFamily: '"Cinzel", serif',
    fontWeight: 600,
    letterSpacing: '0.03em',
  };

  return (
    <GeekDialog
      open={open}
      onClose={onClose}
      title={title}
      mode={mode}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
      keepSecondaryOnMobile={keepSecondaryOnMobile}
      headerSx={{ borderBottom: hairline }}
      primaryActionSx={{
        // The theme paints `containedPrimary` with a gradient and no disabled
        // branch, so a disabled header action reads as live. Dim it here
        // rather than in the theme, where it would touch every button.
        '& .MuiButton-root.Mui-disabled': {
          background: alpha(theme.palette.text.disabled, 0.18),
          color: theme.palette.text.disabled,
        },
      }}
      titleSx={{ ...codexTitle, borderBottom: hairline }}
      bodySx={bodySx}
      dialogProps={dialogProps}
      sx={{
        backgroundImage: 'none',
        backgroundColor: theme.palette.background.paper,
        border: { xs: 'none', sm: `1px solid ${alpha(gold, 0.25)}` },
        // The full-screen header's `h3` title is already Cinzel from the
        // theme; this keeps the two modes' titles identical anyway.
        '& [data-geek-dialog="title"]': codexTitle,
        '& [data-geek-dialog="footer"]': { borderTop: hairline },
        '& [data-geek-dialog="actions"]': { px: 3, py: 2, borderTop: hairline },
      }}
    >
      {children}
    </GeekDialog>
  );
}
