/**
 * QuickHarvestSheet — the harvest entry, moved into the thumb zone.
 *
 * Logging eggs is the one thing a caretaker does standing in a coop with one
 * hand full, and it used to live mid-page behind a scroll (MOBILE_UI_PLAN.md
 * §4). Below `md` the page hides its inline `QuickHarvestEntry` and mounts
 * this instead: the page registers "Log eggs" with `useGeekPrimaryAction`, the
 * shell renders the `GeekFab`, and the FAB opens a `GeekSheet` holding *the
 * same* `QuickHarvestEntry` — same query, same mutation, same location
 * defaulting.
 *
 * The sheet closes itself once a harvest lands, then hands the page its own
 * `onSuccess` so a list can refetch.
 *
 * At `md`+ nothing mounts: the FAB is `showOn: 'mobile'` and the page's inline
 * panel is the only entry point, exactly as before.
 */
import { useCallback, useState } from "react";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import EggIcon from "@mui/icons-material/EggAlt";
import { GeekSheet, geekLayout, useGeekPrimaryAction } from "@geeksuite/ui";
import QuickHarvestEntry from "./QuickHarvestEntry";

const QuickHarvestSheet = ({ locations = [], onSuccess, label = "Log eggs" }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down(geekLayout.navBreakpoint));
  const [open, setOpen] = useState(false);

  useGeekPrimaryAction({
    label,
    icon: <EggIcon />,
    onClick: () => setOpen(true)
  });

  const handleSuccess = useCallback(() => {
    setOpen(false);
    onSuccess?.();
  }, [onSuccess]);

  // Nothing to mount at desktop widths: the FAB hides itself there.
  if (!isMobile) return null;

  return (
    <GeekSheet
      open={open}
      onClose={() => setOpen(false)}
      title="Quick harvest"
      description="Today's count, averaged over the days it covers."
      snap="content"
    >
      <QuickHarvestEntry variant="sheet" locations={locations} onSuccess={handleSuccess} />
    </GeekSheet>
  );
};

export default QuickHarvestSheet;
