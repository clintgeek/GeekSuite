/**
 * LedgerDialog — the canonical FlockGeek form dialog, a skin over `GeekDialog`.
 *
 * The primitive owns the rule (MOBILE_UI_PLAN.md §2): full-screen below `sm`
 * with a header of close ✕ / title / primary action, the familiar window at
 * `sm`+. This wrapper owns the identity all five flockgeek forms were
 * re-deriving by hand: the DM Serif Display title, the hairline rules above
 * and below the body, the parchment paper and the ledger's quiet footer band.
 *
 * Forms live in the body while the primary button lives in the header below
 * `sm`, so a consumer gives its `<form>` an `id` and its primary button
 * `type="submit" form={thatId}` — the HTML `form` attribute associates the two
 * across the DOM, and Enter-to-submit keeps working in both modes.
 *
 * Props:
 *   open, onClose            — passed through
 *   title                    — string or node; set in the display serif
 *   primaryAction            — the save/add button (header-right below `sm`,
 *                              footer at `sm`+)
 *   secondaryAction          — Cancel; the ✕ replaces it below `sm` unless
 *                              `keepSecondaryOnMobile`
 *   maxWidth, fullWidth      — window-mode sizing
 *   contentSx                — sx overrides on the body
 *   children                 — the form
 */
import { useTheme } from "@mui/material/styles";
import { GeekDialog } from "@geeksuite/ui";

const SERIF = '"DM Serif Display", Georgia, serif';

const LedgerDialog = ({
  open,
  onClose,
  title,
  primaryAction,
  secondaryAction,
  keepSecondaryOnMobile = false,
  maxWidth = "sm",
  fullWidth = true,
  contentSx,
  headerSx,
  disableClose = false,
  children,
  ...rest
}) => {
  const theme = useTheme();
  const hairline = `1px solid ${theme.palette.divider}`;
  const footerTint =
    theme.palette.mode === "dark" ? "rgba(232,226,212,0.02)" : "rgba(26,26,24,0.015)";

  // The serif at display sizes only — the mobile grammar's floor is 18px and
  // DM Serif Display below that is mud.
  const serifTitle = {
    fontFamily: SERIF,
    fontWeight: 400,
    fontSize: { xs: "1.25rem", sm: "1.5rem" },
    letterSpacing: 0.2,
    lineHeight: 1.2,
    color: "text.primary"
  };

  return (
    <GeekDialog
      open={open}
      onClose={onClose}
      disableClose={disableClose}
      title={title}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
      keepSecondaryOnMobile={keepSecondaryOnMobile}
      headerSx={{ alignItems: "center", py: 1, borderBottom: hairline, ...headerSx }}
      titleSx={{
        px: { xs: 2.5, sm: 3 },
        pt: { xs: 2.5, sm: 3 },
        pb: 2,
        borderBottom: hairline,
        ...serifTitle
      }}
      bodySx={{ px: { xs: 2, sm: 3 }, py: { xs: 2.5, sm: 3 }, ...contentSx }}
      sx={{
        backgroundColor: theme.palette.background.paper,
        backgroundImage: "none",
        borderRadius: { xs: 0, sm: 2 },
        // Full mode: the header's own title node, set in the serif.
        '& [data-geek-dialog="title"]': serifTitle,
        '& [data-geek-dialog="footer"]': {
          borderTop: hairline,
          backgroundColor: footerTint,
          gap: 1
        },
        '& [data-geek-dialog="actions"]': {
          px: { xs: 2, sm: 3 },
          py: 2,
          borderTop: hairline,
          backgroundColor: footerTint,
          gap: 1
        }
      }}
      dialogProps={rest}
    >
      {children}
    </GeekDialog>
  );
};

export default LedgerDialog;
