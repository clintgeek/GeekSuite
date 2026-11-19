/**
 * QuickHarvestSheet — the harvest entry, moved into the thumb zone.
 *
 * Logging eggs is the one thing a caretaker does standing in a coop with one
 * hand full, and it used to live mid-page behind a scroll (MOBILE_UI_PLAN.md
 * §4). Below `md` the page hides its inline `QuickHarvestEntry` and mounts
 * this instead: a "Log eggs" `GeekFab` that opens a `GeekSheet` holding *the
 * same* `QuickHarvestEntry` — same query, same mutation, same location
 * defaulting.
 *
 * The FAB says "Log eggs" in words on the phone too (UX review 2026-11-18,
 * FlockGeek 4). The shell's primary-action FAB is icon-only at `xs` and its
 * registry has no way to ask for the label, so this sheet mounts its own
 * `GeekFab` (extended, label kept at `xs`) instead of registering one. It is
 * portalled to `document.body`: the page sits inside `GeekAppFrame`'s route
 * transition, a framer-motion element, which must not become the containing
 * block of a `position: fixed` FAB. Pages that mount this pad their own
 * bottom by `HARVEST_FAB_CLEARANCE` (utils/harvestDefaults.js) so the FAB never covers the last row.
 *
 * Open state may be controlled (`open` + `onOpenChange`) so Home's "Today"
 * line can open the same sheet.
 *
 * The sheet closes itself once a harvest lands, then hands the page its own
 * `onSuccess` so a list can refetch.
 *
 * At `md`+ nothing mounts: the page's inline panel is the entry point there.
 */
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import EggIcon from "@mui/icons-material/EggAlt";
import { GeekFab, GeekSheet, geekLayout } from "@geeksuite/ui";
import QuickHarvestEntry from "./QuickHarvestEntry";

const QuickHarvestSheet = ({ locations = [], onSuccess, label = "Log eggs", open: openProp, onOpenChange }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down(geekLayout.navBreakpoint));
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = controlled ? openProp : openState;

  const setOpen = useCallback((next) => {
    if (!controlled) setOpenState(next);
    onOpenChange?.(next);
  }, [controlled, onOpenChange]);

  const handleSuccess = useCallback(() => {
    setOpen(false);
    onSuccess?.();
  }, [onSuccess, setOpen]);

  // Nothing to mount at desktop widths.
  if (!isMobile) return null;

  const fab = (
    <GeekFab
      extended
      label={label}
      icon={<EggIcon />}
      onClick={() => setOpen(true)}
      // GeekFab's `extended` hides the words at `xs`; on this app's one daily
      // job the words are the point, so they stay.
      sx={{
        width: "auto",
        paddingInline: "20px",
        "& > span:not(.MuiTouchRipple-root)": { display: "inline" },
      }}
    />
  );

  return (
    <>
      {typeof document !== "undefined" ? createPortal(fab, document.body) : fab}
      <GeekSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Log eggs"
        description="Today's count, averaged over the days it covers."
        snap="content"
      >
        <QuickHarvestEntry variant="sheet" locations={locations} onSuccess={handleSuccess} />
      </GeekSheet>
    </>
  );
};

export default QuickHarvestSheet;
