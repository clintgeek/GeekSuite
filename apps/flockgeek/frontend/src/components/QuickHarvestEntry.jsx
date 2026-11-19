import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from '@apollo/client';
import { displayCalendarDate, localDateString, startOfLocalDay } from "@geeksuite/utils";
import {
  Paper,
  Box,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Chip,
  Collapse
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import EggIcon from "@mui/icons-material/EggAlt";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { slashFocusProps, useToast } from "@geeksuite/ui";
import { GET_EGG_PRODUCTIONS, GET_LAST_EGG_PRODUCTION } from "../graphql/queries";
import { RECORD_EGG_PRODUCTION } from "../graphql/mutations";
import { rollingWindow } from "../hooks/useHomeData";
import { readLastPen, rememberPen, usualCounts } from "../utils/harvestDefaults";

/**
 * QuickHarvestEntry — the app's real "do" action.
 *
 * It used to sit mid-page behind a hover-only border, with 30px quick-add
 * chips and a tooltip as the only explanation of the `÷ days` field
 * (MOBILE_UI_PLAN.md §4). The controls are 44px now and the `÷ days` rule is
 * written on the page rather than hidden under a pointer that phones do not
 * have.
 *
 * `variant="sheet"` drops the framing Paper so `QuickHarvestSheet` can mount
 * the same component — same query, same mutation, same state — inside a
 * `GeekSheet` in the thumb zone.
 *
 * Three taps for the common morning (UX review 2026-11-18, FlockGeek 1 and 3):
 * the last pen logged on this device is preselected, the quick counts are
 * built around the usual count at that pen (`utils/harvestDefaults.js`) and
 * sit directly under the count, and `÷ days` — needed rarely, and prefilled
 * from the last harvest — is one quiet "Covers 1 day · Change" line instead of
 * a third of the sheet. The counts used to sit under the days caption and
 * read as a days picker.
 */
const QuickHarvestEntry = ({ onSuccess, locations = [], variant = "panel" }) => {
  const inSheet = variant === "sheet";
  const [eggCount, setEggCount] = useState(0);
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [showDays, setShowDays] = useState(false);
  const { notify } = useToast();

  // Recent harvests for the quick counts. Same 14-day window and variables as
  // Home's tallies, so on Home this is answered from the cache.
  const { todayStr, rollingStartStr } = rollingWindow();
  const { data: recentData } = useQuery(GET_EGG_PRODUCTIONS, {
    variables: { startDate: rollingStartStr, endDate: todayStr },
  });

  // The last harvest at the selected location. This used to fetch EVERY egg
  // record ever logged and sort them here, each time the sheet opened
  // (SUITE_REVIEW_2026-11, FlockGeek 1); the gateway answers it with one
  // indexed read now. No location picked → no prefill, as before.
  const { data: lastData } = useQuery(GET_LAST_EGG_PRODUCTION, {
    variables: { locationId },
    skip: !locationId,
    fetchPolicy: 'cache-and-network',
  });
  const lastForLocation = locationId ? lastData?.lastEggProduction ?? null : null;

  const { lastHarvest, daysSinceLastHarvest } = useMemo(() => {
    if (!lastForLocation) return { lastHarvest: null, daysSinceLastHarvest: 1 };
    const last = lastForLocation;
    const lastUTCDate = new Date(last.date);
    const lastDateLocal = new Date(lastUTCDate.getUTCFullYear(), lastUTCDate.getUTCMonth(), lastUTCDate.getUTCDate());
    const today = startOfLocalDay();
    const diffDays = Math.round((today - lastDateLocal) / (1000 * 60 * 60 * 24));
    return { lastHarvest: last, daysSinceLastHarvest: Math.max(1, diffDays) };
  }, [lastForLocation]);

  const [daysOverride, setDaysOverride] = useState(null);
  const days = daysOverride ?? daysSinceLastHarvest;

  const [recordEggProduction, { loading: submitting }] = useMutation(RECORD_EGG_PRODUCTION, {
    refetchQueries: ['GetEggProductions', 'GetLastEggProduction'],
    awaitRefetchQueries: true,
    onCompleted: () => {
      const daysText = days > 1 ? ` (${ days } days)` : "";
      notify(`Logged ${ eggCount } egg${ eggCount !== 1 ? "s" : "" }${ daysText }`, { tone: 'success' });
      setEggCount(0);
      setNotes("");
      setShowDetails(false);
      setShowDays(false);
      setDaysOverride(null);
      rememberPen(locationId);
      if (onSuccess) onSuccess();
    },
    onError: (err) => notify(err.message || "Failed to log harvest", { tone: 'error' }),
  });

  const handleSubmit = async () => {
    if (eggCount === 0) { notify("Enter at least 1 egg", { tone: 'error' }); return; }
    const payload = {
      // `source: "manual"` used to be here. `RECORD_EGG_PRODUCTION` declares no
      // `$source` variable and the gateway's `recordEggProduction` takes no
      // `source` argument, so GraphQL discarded it in silence — the field was
      // never set on a single record. Dropped rather than left as a lie; if
      // the provenance is wanted, the argument has to exist on the gateway
      // first. Going-over 2026-09-05.
      date: localDateString(new Date()),
      eggsCount: eggCount,
      daysObserved: days,
      ...(locationId ? { locationId } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    recordEggProduction({ variables: payload });
  };

  // Default the pen once, when the locations arrive: the pen last logged to
  // on this device if it still exists, else the only pen there is. Once only,
  // so choosing "No specific location" is not undone on the next render.
  const defaultedRef = React.useRef(false);
  React.useEffect(() => {
    if (defaultedRef.current || locations.length === 0) return;
    defaultedRef.current = true;
    if (locationId) return;
    const remembered = readLastPen();
    if (remembered && locations.some((l) => l.id === remembered)) setLocationId(remembered);
    else if (locations.length === 1) setLocationId(locations[0].id);
  }, [locations, locationId]);

  const { counts: quickCounts, usual } = useMemo(
    () => usualCounts(recentData?.eggProductions || [], locationId),
    [recentData, locationId]
  );

  const body = (
    <>
      {!inSheet && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <EggIcon sx={{ color: "primary.main", fontSize: 28 }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Quick Harvest Entry</Typography>
        </Box>
      )}

      {locations.length > 1 && (
        <FormControl fullWidth sx={{ mb: 2, maxWidth: { sm: 320 } }}>
          <InputLabel id="quick-harvest-location-label">Location / Pen</InputLabel>
          <Select
            labelId="quick-harvest-location-label"
            value={locationId}
            label="Location / Pen"
            onChange={(e) => { setLocationId(e.target.value); setDaysOverride(null); }}
          >
            <MenuItem value=""><em>No specific location</em></MenuItem>
            {locations.map((loc) => (
              <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {locations.length === 1 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          📍 {locations[0].name}
        </Typography>
      )}

      {locationId && (
        <Box sx={{ mb: 2 }}>
          {lastHarvest ? (
            <Chip
              size="small"
              label={`Last harvest: ${ displayCalendarDate(lastHarvest.date) } (${ daysSinceLastHarvest } day${ daysSinceLastHarvest !== 1 ? "s" : "" } ago) — ${ lastHarvest.eggsCount } egg${ lastHarvest.eggsCount !== 1 ? "s" : "" }`}
              sx={{ bgcolor: (theme) => alpha(theme.palette.success.main, 0.1), color: "text.primary" }}
            />
          ) : (
            <Chip
              size="small"
              label="No previous harvest recorded for this location"
              sx={{ bgcolor: (theme) => alpha(theme.palette.warning.main, 0.1), color: "text.primary" }}
            />
          )}
        </Box>
      )}

      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <IconButton
          onClick={() => setEggCount(prev => Math.max(0, prev - 1))}
          disabled={eggCount === 0}
          aria-label="Remove one egg"
          sx={{
            width: 56, height: 56,
            bgcolor: (theme) => alpha(theme.palette.error.main, 0.08),
            "&:hover": { bgcolor: (theme) => alpha(theme.palette.error.main, 0.15) },
            "&:disabled": { bgcolor: "action.disabledBackground" }
          }}
        >
          <RemoveIcon fontSize="large" />
        </IconButton>

        <TextField
          type="number"
          value={eggCount}
          onChange={(e) => setEggCount(Math.max(0, parseInt(e.target.value) || 0))}
          // `/` (suite slash focus) lands here: logging eggs is the home page's job.
          inputProps={{ min: 0, 'aria-label': 'Eggs collected', ...slashFocusProps(30), style: { textAlign: "center", fontSize: "2rem", fontWeight: 700, width: "80px" } }}
          sx={{ "& .MuiOutlinedInput-root": { backgroundColor: "background.paper" } }}
        />

        <IconButton
          onClick={() => setEggCount(prev => prev + 1)}
          aria-label="Add one egg"
          sx={{
            width: 56, height: 56,
            bgcolor: (theme) => alpha(theme.palette.success.main, 0.08),
            "&:hover": { bgcolor: (theme) => alpha(theme.palette.success.main, 0.15) }
          }}
        >
          <AddIcon fontSize="large" />
        </IconButton>

      </Box>

      {/* One-tap counts, directly under the count they set. */}
      <Typography id="quick-harvest-counts-label" variant="caption" sx={{ display: "block", color: "text.secondary", mb: 1, fontSize: "0.75rem" }}>
        {usual ? `Usual count${locationId ? " at this pen" : ""}: ${usual}` : "Quick counts"}
      </Typography>
      <Box role="group" aria-labelledby="quick-harvest-counts-label" sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        {quickCounts.map((n) => (
          <Button key={n} variant="outlined" onClick={() => setEggCount(n)}
            aria-pressed={eggCount === n}
            sx={{
              minWidth: 44, width: 44, height: 44, px: 0,
              bgcolor: eggCount === n ? (theme) => alpha(theme.palette.primary.main, 0.12) : "transparent",
              borderColor: eggCount === n ? "primary.main" : undefined
            }}>
            {n}
          </Button>
        ))}
      </Box>

      {/* ÷ days: one quiet line; the field and its rule open on demand. */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: showDays ? 1 : 2 }}>
        <Typography variant="body2" color="text.secondary">
          Covers {days} day{days !== 1 ? "s" : ""}
        </Typography>
        <Button
          onClick={() => setShowDays((v) => !v)}
          aria-expanded={showDays}
          aria-controls="quick-harvest-days"
          aria-label="Change days covered"
          sx={{ minHeight: 44, color: "text.secondary", textDecoration: "underline" }}
        >
          Change
        </Button>
      </Box>
      <Collapse in={showDays} id="quick-harvest-days" unmountOnExit>
        <Box sx={{ mb: 2 }}>
          <TextField
            type="number"
            value={days}
            onChange={(e) => setDaysOverride(Math.max(1, parseInt(e.target.value) || 1))}
            InputProps={{
              startAdornment: <Box component="span" sx={{ color: "text.secondary", mr: 0.5, userSelect: "none" }}>÷</Box>,
              endAdornment: <Box component="span" sx={{ color: "text.secondary", ml: 0.5, fontSize: "0.75rem", userSelect: "none" }}>days</Box>,
            }}
            inputProps={{ min: 1, 'aria-label': 'Days observed', style: { textAlign: "center", width: "44px" } }}
            sx={{ width: 116, mb: 1, "& .MuiOutlinedInput-root": { minHeight: 44 } }}
          />
          {/* The ÷ days rule, on the page rather than under a pointer. */}
          <Typography variant="caption" sx={{ display: "block", color: "text.muted", fontSize: "0.75rem" }}>
            ÷ days is how many days this harvest covers — the count is averaged over that
            many days{lastHarvest ? " (prefilled from the last harvest at this location)" : ""}.
          </Typography>
        </Box>
      </Collapse>

      <Button onClick={() => setShowDetails(!showDetails)} endIcon={showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />} sx={{ mb: 1, color: "text.secondary" }}>
        {showDetails ? "Hide" : "Add"} Notes
      </Button>

      <Collapse in={showDetails}>
        <TextField
          label="Notes (optional)" fullWidth multiline rows={2}
          value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g., One cracked, found in unusual spot..." sx={{ mb: 2 }}
        />
      </Collapse>

      <Button
        variant="contained" size="large" fullWidth onClick={handleSubmit}
        disabled={submitting || eggCount === 0}
        sx={{ py: 1.5, fontSize: "1.1rem", fontWeight: 600 }}
      >
        {submitting ? "Saving..." : `Log ${ eggCount } Egg${ eggCount !== 1 ? "s" : "" }`}
      </Button>

      {eggCount > 0 && days > 1 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: "center" }}>
          ≈ {(eggCount / days).toFixed(1)} eggs/day average
        </Typography>
      )}
    </>
  );

  if (inSheet) return <Box sx={{ pb: 1 }}>{body}</Box>;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, sm: 3 },
        mb: 3,
        borderColor: (theme) => alpha(theme.palette.primary.main, 0.25),
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.03)
      }}
    >
      {body}
    </Paper>
  );
};

export default QuickHarvestEntry;
