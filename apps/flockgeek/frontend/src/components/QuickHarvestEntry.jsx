import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from '@apollo/client';
import { toLocalDateString } from "../utils/dateUtils";
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
  Alert,
  Collapse,
  Tooltip
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import EggIcon from "@mui/icons-material/EggAlt";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { GET_EGG_PRODUCTIONS } from "../graphql/queries";
import { RECORD_EGG_PRODUCTION } from "../graphql/mutations";

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
 */
const QuickHarvestEntry = ({ onSuccess, locations = [], variant = "panel" }) => {
  const inSheet = variant === "sheet";
  const [eggCount, setEggCount] = useState(0);
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Fetch recent egg productions to find last harvest per location
  const { data: eggsData, refetch: refetchEggs } = useQuery(GET_EGG_PRODUCTIONS, {
    fetchPolicy: 'cache-and-network',
  });
  const allEggs = eggsData?.eggProductions || [];

  // Find last harvest for the selected location
  const { lastHarvest, daysSinceLastHarvest } = useMemo(() => {
    if (!locationId) return { lastHarvest: null, daysSinceLastHarvest: 1 };
    const forLocation = allEggs
      .filter(e => e.locationId === locationId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (forLocation.length === 0) return { lastHarvest: null, daysSinceLastHarvest: 1 };
    const last = forLocation[0];
    const lastUTCDate = new Date(last.date);
    const lastDateLocal = new Date(lastUTCDate.getUTCFullYear(), lastUTCDate.getUTCMonth(), lastUTCDate.getUTCDate());
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - lastDateLocal) / (1000 * 60 * 60 * 24));
    return { lastHarvest: last, daysSinceLastHarvest: Math.max(1, diffDays) };
  }, [locationId, allEggs]);

  const [daysOverride, setDaysOverride] = useState(null);
  const days = daysOverride ?? daysSinceLastHarvest;

  const [recordEggProduction, { loading: submitting }] = useMutation(RECORD_EGG_PRODUCTION, {
    refetchQueries: ['GetEggProductions'],
    awaitRefetchQueries: true,
    onCompleted: () => {
      const daysText = days > 1 ? ` (${ days } days)` : "";
      setSuccess(`Logged ${ eggCount } egg${ eggCount !== 1 ? "s" : "" }${ daysText }`);
      setEggCount(0);
      setNotes("");
      setShowDetails(false);
      setDaysOverride(null);
      refetchEggs();
      if (onSuccess) onSuccess();
      setTimeout(() => setSuccess(""), 2000);
    },
    onError: (err) => setError(err.message || "Failed to log harvest"),
  });

  const handleSubmit = async () => {
    if (eggCount === 0) { setError("Enter at least 1 egg"); return; }
    setError("");
    const payload = {
      date: toLocalDateString(new Date()),
      eggsCount: eggCount,
      daysObserved: days,
      source: "manual",
      ...(locationId ? { locationId } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    recordEggProduction({ variables: payload });
  };

  // Auto-select single location
  React.useEffect(() => {
    if (locations.length === 1 && !locationId) setLocationId(locations[0].id);
  }, [locations, locationId]);

  const quickAddButtons = [1, 2, 3, 4, 5, 6];

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
          <InputLabel>Location / Pen</InputLabel>
          <Select value={locationId} label="Location / Pen" onChange={(e) => { setLocationId(e.target.value); setDaysOverride(null); }}>
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
              label={`Last harvest: ${ new Date(lastHarvest.date).toLocaleDateString(undefined, { timeZone: 'UTC' }) } (${ daysSinceLastHarvest } day${ daysSinceLastHarvest !== 1 ? "s" : "" } ago) — ${ lastHarvest.eggsCount } egg${ lastHarvest.eggsCount !== 1 ? "s" : "" }`}
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
          inputProps={{ min: 0, style: { textAlign: "center", fontSize: "2rem", fontWeight: 700, width: "80px" } }}
          sx={{ "& .MuiOutlinedInput-root": { backgroundColor: "background.paper" } }}
        />

        <IconButton
          onClick={() => setEggCount(prev => prev + 1)}
          sx={{
            width: 56, height: 56,
            bgcolor: (theme) => alpha(theme.palette.success.main, 0.08),
            "&:hover": { bgcolor: (theme) => alpha(theme.palette.success.main, 0.15) }
          }}
        >
          <AddIcon fontSize="large" />
        </IconButton>

        <Tooltip title="Days since last harvest — eggs will be averaged over this period">
          <TextField
            type="number"
            value={days}
            aria-label="Days observed"
            onChange={(e) => setDaysOverride(Math.max(1, parseInt(e.target.value) || 1))}
            InputProps={{
              startAdornment: <Box component="span" sx={{ color: "text.secondary", mr: 0.5, userSelect: "none" }}>÷</Box>,
              endAdornment: <Box component="span" sx={{ color: "text.secondary", ml: 0.5, fontSize: "0.75rem", userSelect: "none" }}>days</Box>,
            }}
            inputProps={{ min: 1, style: { textAlign: "center", width: "44px" } }}
            // The border used to appear on hover only, which on a touch screen
            // meant never. It is always drawn now.
            sx={{ width: 116, "& .MuiOutlinedInput-root": { minHeight: 44 } }}
          />
        </Tooltip>
      </Box>

      {/* The ÷ days rule, on the page rather than under a pointer. */}
      <Typography variant="caption" sx={{ display: "block", color: "text.muted", mb: 2, fontSize: "0.75rem" }}>
        ÷ days is how many days this harvest covers — the count is averaged over that
        many days{lastHarvest ? " (prefilled from the last harvest at this location)" : ""}.
      </Typography>

      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        {[...quickAddButtons, 12].map((n) => (
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

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

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
