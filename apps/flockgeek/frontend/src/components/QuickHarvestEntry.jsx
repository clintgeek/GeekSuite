import React, { useState, useEffect, useCallback } from "react";
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
import client from "../services/apiClient";

/**
 * Quick Harvest Entry - Fast egg collection logging
 *
 * Features:
 * - Large +/- buttons for egg count (tap-friendly)
 * - Auto-calculates days since last harvest for selected location
 * - Defaults to today's date
 * - Minimal required fields, optional expansion for details
 */
const QuickHarvestEntry = ({ onSuccess, locations = [] }) => {
  const [eggCount, setEggCount] = useState(0);
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Last harvest info
  const [lastHarvest, setLastHarvest] = useState(null);
  const [daysSinceLastHarvest, setDaysSinceLastHarvest] = useState(1);
  const [loadingLastHarvest, setLoadingLastHarvest] = useState(false);

  // Auto-select first location if only one exists
  useEffect(() => {
    if (locations.length === 1 && !locationId) {
      setLocationId(locations[0]._id);
    }
  }, [locations, locationId]);

  // Fetch last harvest when location changes
  const fetchLastHarvest = useCallback(async () => {
    if (!locationId) {
      setLastHarvest(null);
      setDaysSinceLastHarvest(1);
      return;
    }

    setLoadingLastHarvest(true);
    try {
      // Get most recent egg production for this location
      const response = await client.get("/egg-production", {
        params: {
          locationId,
          limit: 1,
          sortBy: "date",
          sortOrder: "desc"
        }
      });

      const records = response.data.data.eggProduction;
      if (records && records.length > 0) {
        const lastRecord = records[0];
        setLastHarvest(lastRecord);

        const lastDate = new Date(lastRecord.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // lastDate could be "2026-02-19T00:00:00.000Z", which parses to local Feb 18 18:00
        // We should parse it as UTC midnight to compare fairly
        const lastUTCDate = new Date(lastRecord.date);
        const lastDateLocal = new Date(lastUTCDate.getUTCFullYear(), lastUTCDate.getUTCMonth(), lastUTCDate.getUTCDate());
        const diffDays = Math.round((today - lastDateLocal) / (1000 * 60 * 60 * 24));
        setDaysSinceLastHarvest(Math.max(1, diffDays));
      } else {
        setLastHarvest(null);
        setDaysSinceLastHarvest(1);
      }
    } catch (err) {
      console.error("Failed to fetch last harvest:", err);
      setLastHarvest(null);
      setDaysSinceLastHarvest(1);
    } finally {
      setLoadingLastHarvest(false);
    }
  }, [locationId]);

  useEffect(() => {
    fetchLastHarvest();
  }, [fetchLastHarvest]);

  const handleIncrement = () => setEggCount(prev => prev + 1);
  const handleDecrement = () => setEggCount(prev => Math.max(0, prev - 1));

  const handleSubmit = async () => {
    if (eggCount === 0) {
      setError("Enter at least 1 egg");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
        eggsCount: eggCount,
        daysObserved: daysSinceLastHarvest,
        source: "manual"
      };

      if (locationId) {
        payload.locationId = locationId;
      }

      if (notes.trim()) {
        payload.notes = notes.trim();
      }

      await client.post("/egg-production", payload);

      // Success feedback
      const daysText = daysSinceLastHarvest > 1 ? ` (${ daysSinceLastHarvest } days)` : "";
      setSuccess(`Logged ${ eggCount } egg${ eggCount !== 1 ? "s" : "" }${ daysText }`);

      // Reset form
      setEggCount(0);
      setNotes("");
      setShowDetails(false);

      // Refresh last harvest info
      setTimeout(() => {
        fetchLastHarvest();
        setSuccess("");
      }, 2000);

      // Notify parent to refresh list
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || "Failed to log harvest");
    } finally {
      setSubmitting(false);
    }
  };

  // Quick-add buttons for common counts
  const quickAddButtons = [1, 2, 3, 4, 5, 6];

  const selectedLocation = locations.find(l => l._id === locationId);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        mb: 3,
        borderColor: (theme) => alpha(theme.palette.primary.main, 0.25),
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.03)
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <EggIcon sx={{ color: "primary.main", fontSize: 28 }} />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Quick Harvest Entry
        </Typography>
      </Box>

      {/* Location selector (if multiple locations) */}
      {locations.length > 1 && (
        <FormControl size="small" sx={{ mb: 2, minWidth: 200 }}>
          <InputLabel>Location / Pen</InputLabel>
          <Select
            value={locationId}
            label="Location / Pen"
            onChange={(e) => setLocationId(e.target.value)}
          >
            <MenuItem value="">
              <em>No specific location</em>
            </MenuItem>
            {locations.map((loc) => (
              <MenuItem key={loc._id} value={loc._id}>
                {loc.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Single location display */}
      {locations.length === 1 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          📍 {locations[0].name}
        </Typography>
      )}

      {/* Last harvest info */}
      {locationId && !loadingLastHarvest && (
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

      {/* Main egg count input */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
        {/* Big decrement button */}
        <IconButton
          onClick={handleDecrement}
          disabled={eggCount === 0}
          sx={{
            width: 56,
            height: 56,
            bgcolor: (theme) => alpha(theme.palette.error.main, 0.08),
            "&:hover": { bgcolor: (theme) => alpha(theme.palette.error.main, 0.15) },
            "&:disabled": { bgcolor: "action.disabledBackground" }
          }}
        >
          <RemoveIcon fontSize="large" />
        </IconButton>

        {/* Egg count display */}
        <TextField
          type="number"
          value={eggCount}
          onChange={(e) => setEggCount(Math.max(0, parseInt(e.target.value) || 0))}
          inputProps={{
            min: 0,
            style: {
              textAlign: "center",
              fontSize: "2rem",
              fontWeight: 700,
              width: "80px"
            }
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              backgroundColor: "background.paper"
            }
          }}
        />

        {/* Big increment button */}
        <IconButton
          onClick={handleIncrement}
          sx={{
            width: 56,
            height: 56,
            bgcolor: (theme) => alpha(theme.palette.success.main, 0.08),
            "&:hover": { bgcolor: (theme) => alpha(theme.palette.success.main, 0.15) }
          }}
        >
          <AddIcon fontSize="large" />
        </IconButton>

        {/* Days observed input */}
        <Tooltip title="Days since last harvest — eggs will be averaged over this period">
          <TextField
            type="number"
            size="small"
            value={daysSinceLastHarvest}
            onChange={(e) => setDaysSinceLastHarvest(Math.max(1, parseInt(e.target.value) || 1))}
            InputProps={{
              startAdornment: <Box component="span" sx={{ color: "text.secondary", mr: 0.5, userSelect: "none" }}>÷</Box>,
              endAdornment: <Box component="span" sx={{ color: "text.secondary", ml: 0.5, fontSize: "0.75rem", userSelect: "none" }}>days</Box>,
            }}
            inputProps={{
              min: 1,
              style: { textAlign: "center", width: "40px", padding: "4px 0" }
            }}
            sx={{
              width: 100,
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: "transparent" // Make it look cleaner/integrated
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: "action.hover"
              },
              "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: "primary.main"
              }
            }}
          />
        </Tooltip>
      </Box>

      {/* Quick-add buttons */}
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        {quickAddButtons.map((n) => (
          <Button
            key={n}
            variant="outlined"
            size="small"
            onClick={() => setEggCount(n)}
            sx={{
              minWidth: 40,
              bgcolor: eggCount === n ? (theme) => alpha(theme.palette.primary.main, 0.12) : "transparent",
              borderColor: eggCount === n ? "primary.main" : undefined
            }}
          >
            {n}
          </Button>
        ))}
        <Button
          variant="outlined"
          size="small"
          onClick={() => setEggCount(12)}
          sx={{
            minWidth: 50,
            bgcolor: eggCount === 12 ? (theme) => alpha(theme.palette.primary.main, 0.12) : "transparent",
            borderColor: eggCount === 12 ? "primary.main" : undefined
          }}
        >
          12
        </Button>
      </Box>

      {/* Expandable details section */}
      <Button
        size="small"
        onClick={() => setShowDetails(!showDetails)}
        endIcon={showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        sx={{ mb: 1, color: "text.secondary" }}
      >
        {showDetails ? "Hide" : "Add"} Notes
      </Button>

      <Collapse in={showDetails}>
        <TextField
          label="Notes (optional)"
          fullWidth
          size="small"
          multiline
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g., One cracked, found in unusual spot..."
          sx={{ mb: 2 }}
        />
      </Collapse>

      {/* Error/Success messages */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      {/* Submit button */}
      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={handleSubmit}
        disabled={submitting || eggCount === 0}
        sx={{
          py: 1.5,
          fontSize: "1.1rem",
          fontWeight: 600
        }}
      >
        {submitting ? "Saving..." : `Log ${ eggCount } Egg${ eggCount !== 1 ? "s" : "" }`}
      </Button>

      {/* Daily rate preview */}
      {eggCount > 0 && daysSinceLastHarvest > 1 && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, textAlign: "center" }}
        >
          ≈ {(eggCount / daysSinceLastHarvest).toFixed(1)} eggs/day average
        </Typography>
      )}
    </Paper>
  );
};

export default QuickHarvestEntry;
