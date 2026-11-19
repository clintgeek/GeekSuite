/**
 * TodayLine — Home's answer to "did someone already collect today?"
 * (UX review 2026-11-18, FlockGeek 2).
 *
 * One line under the greeting: "Today: not logged yet" with a "Log eggs"
 * action, or "Today: 9 eggs · North Coop" once a harvest is in. Below `md` the
 * action opens the harvest sheet in place (`onLog`); at `md`+ it goes to the
 * Egg log, where the inline harvest panel lives.
 */
import { Box, Button, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import CheckIcon from "@mui/icons-material/CheckCircleOutline";

const TodayLine = ({ today, locationName = () => null, onLog, isMobile }) => {
  if (!today) return null;
  const pens = today.locationIds.map(locationName).filter(Boolean);
  const logAction = isMobile
    ? { onClick: onLog }
    : { component: RouterLink, to: "/egg-log" };

  return (
    <Box
      data-testid="home-today"
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        columnGap: 2,
        rowGap: 0.5,
        py: 1,
        px: 2,
        mb: 4,
        maxWidth: 520,
        borderLeft: (theme) => `3px solid ${today.logged ? theme.palette.success.main : theme.palette.primary.main}`,
        bgcolor: "background.paper",
      }}
    >
      {today.logged ? (
        <>
        <Typography variant="body1" sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 44 }}>
          <CheckIcon fontSize="small" sx={{ color: "success.main" }} aria-hidden="true" />
          <span>
            <Box component="strong" sx={{ fontWeight: 600 }}>Today:</Box>{" "}
            {today.eggs} egg{today.eggs !== 1 ? "s" : ""}
            {pens.length ? ` · ${pens.join(", ")}` : ""}
          </span>
        </Typography>
        {/* The way to today's records — and, on the phone, the one focusable
            thing in the scrolling frame once the FAB has left it (axe
            scrollable-region-focusable). */}
        <Button component={RouterLink} to="/egg-log" variant="text" sx={{ minHeight: 44, fontWeight: 600 }}>
          Egg log
        </Button>
        </>
      ) : (
        <>
          <Typography variant="body1" sx={{ minHeight: 44, display: "flex", alignItems: "center" }}>
            <Box component="strong" sx={{ fontWeight: 600, mr: 0.5 }}>Today:</Box> not logged yet
          </Typography>
          <Button variant="text" sx={{ minHeight: 44, fontWeight: 600 }} {...logAction}>
            Log eggs
          </Button>
        </>
      )}
    </Box>
  );
};

export default TodayLine;
