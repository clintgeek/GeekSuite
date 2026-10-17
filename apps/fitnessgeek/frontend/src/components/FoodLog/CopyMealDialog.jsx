import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Chip
} from '@mui/material';
import { ContentCopy as CopyIcon } from '@mui/icons-material';
import { readableOn, useGeekDialogFullScreen } from '@geeksuite/ui';
import { fitnessGeekService } from '../../services/fitnessGeekService';
import { errorMessage } from '../../utils/errorMessage.js';
import { mealLabel, mealWord } from '../../utils/plainWords.js';
import { useToday } from '../../hooks/useToday.js';
import { rowDay } from '../../utils/experience.js';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import DateField from '../primitives/DateField.jsx';
import { thumbSaveProps } from '../BloodPressure/thumbSave.jsx';
import { useUndoToast } from '../FoodSearch/undoToast.jsx';
import { dayName, mealOnDayShort } from './dayWords.js';
import { WHOLE_DAY, copySummary, plural } from './copyWords.js';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * Shift a CALENDAR date (`YYYY-MM-DD`, e.g. `currentDate` — the day the food
 * log page is showing, not a moment in time) by whole days, staying in local
 * time throughout.
 *
 * The bug this replaces: `new Date(currentDate)` parses a bare `YYYY-MM-DD`
 * as UTC midnight, but the `.getDate()`/`.setDate()` that followed read and
 * wrote LOCAL calendar fields. For anyone west of UTC those name different
 * days — UTC midnight is 7pm the previous day in Central — so `+1 day`
 * landed back on the day already showing (silently overwriting TODAY'S log
 * instead of tomorrow's, which is data loss, not a display glitch) and
 * `-1 day` landed two days back instead of one. `pages/FoodLog.jsx`'s
 * `goToPreviousDay`/`goToNextDay` avoid this by destructuring year/month/day
 * first and building the `Date` in local time from the start; this is that
 * same pattern, not a new one.
 */
const shiftDate = (dateString, deltaDays) => {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + deltaDays);
  return fitnessGeekService.formatDate(date);
};

/**
 * Copy a meal from another day, or from someone in the household.
 *
 * It used to copy the whole day by default, with Copy top-right, a summary in
 * ISO dates and no way back (UX review L3). Now:
 *   - nothing copies until a source meal is chosen; "Whole day" is an option
 *     you pick, never the empty default;
 *   - "Whose log" says what the From select is (Mine, or a name);
 *   - the summary is a sentence, with the number of foods it will add;
 *   - Copy sits at the bottom on a phone (thumbSaveProps);
 *   - a copy ends with the standard toast, whose Undo removes what was added.
 *
 * In Simple the page hides its link: "Same as …" in the add sheet covers her.
 */
const CopyMealDialog = ({ open, onClose, currentDate, onCopyComplete, prefill = null }) => {
  const fullScreen = useGeekDialogFullScreen();
  const today = useToday();
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [fromDate, setFromDate] = useState(currentDate);
  const [fromMealType, setFromMealType] = useState('');
  const [toDate, setToDate] = useState('');
  const [toMealType, setToMealType] = useState('');

  // Household state
  const [householdMembers, setHouseholdMembers] = useState([]);
  const [fromUserId, setFromUserId] = useState('');

  // How many foods the chosen source holds (null = not known yet).
  const [sourceCount, setSourceCount] = useState(null);

  // Undo removes exactly what the copy added, then the page refreshes.
  const undoCopy = useCallback(async (logIds) => {
    const settled = await Promise.allSettled(logIds.map((id) => fitnessGeekService.deleteFoodLog(id)));
    const deleted = [];
    const failed = [];
    settled.forEach((r, i) => (r.status === 'fulfilled' ? deleted : failed).push(logIds[i]));
    return { deleted, failed };
  }, []);
  const { offerUndo } = useUndoToast(undoCopy);

  // Load household members when dialog opens
  useEffect(() => {
    if (open) {
      loadHouseholdMembers();
      // Into the day on screen, from the day before it (REVIEW_2026-10 B10).
      // The destination used to default to tomorrow: the copy worked, today
      // didn't change, and it read as "copy doesn't work". The source is the
      // day before so the default never copies a day onto itself.
      setFromDate(shiftDate(currentDate, -1));
      setToDate(currentDate);
      setFromMealType('');
      setToMealType('');
      setFromUserId('');
      setError('');

      if (prefill) {
        setFromDate(prefill.fromDate || currentDate);
        // A household "Copy the whole day" sends no meal: that is a choice.
        setFromMealType(prefill.fromMealType || WHOLE_DAY);
        setToDate(prefill.targetDate || currentDate);
        setToMealType(prefill.toMealType ?? '');
        setFromUserId(prefill.fromUserId || '');
      }
    }
  }, [open, currentDate, prefill]);

  const loadHouseholdMembers = async () => {
    try {
      // Resolves to the household itself, not `{ data }` — see HouseholdLogView.
      const household = await fitnessGeekService.getHouseholdMembers();
      if (household?.members) {
        setHouseholdMembers(household.members);
      }
    } catch (error) {
      // Silently fail - household is optional
      console.debug('No household configured', error);
    }
  };

  // Count what's there, so the summary can say "(3 foods)" and an empty
  // meal can say so before Copy is tapped. A failed count isn't a blocker.
  useEffect(() => {
    if (!open || !fromDate || !fromMealType) {
      setSourceCount(null);
      return undefined;
    }
    let cancelled = false;
    setSourceCount(null);
    (async () => {
      try {
        const rows = fromUserId
          ? await fitnessGeekService.getHouseholdMemberLogs(fromUserId, fromDate)
          : await fitnessGeekService.getLogsForDate(fromDate);
        if (cancelled || !Array.isArray(rows)) return;
        const onDay = rows.filter((r) => { const d = rowDay(r); return !d || d === fromDate; });
        const inMeal = fromMealType === WHOLE_DAY ? onDay : onDay.filter((r) => r.meal_type === fromMealType);
        setSourceCount(inMeal.length);
      } catch {
        if (!cancelled) setSourceCount(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, fromDate, fromMealType, fromUserId]);

  const sharingMembers = householdMembers.filter((m) => m.shares_food_logs);
  const whose = fromUserId ? (householdMembers.find((m) => m.user_id === fromUserId)?.display_name || 'their') : null;
  const ownerWord = whose ? `${whose}’s` : 'your';
  const fromMealWords = fromMealType === WHOLE_DAY ? 'whole day' : mealWord(fromMealType);
  const sameSpot = !fromUserId && fromDate === toDate
    && (fromMealType === WHOLE_DAY || !toMealType || toMealType === fromMealType);
  const nothingThere = sourceCount === 0;
  const canCopy = Boolean(fromDate && toDate && fromMealType) && !sameSpot && !nothingThere && !copying;

  const handleCopy = async () => {
    if (!canCopy) return;
    try {
      setCopying(true);
      setError('');

      const wholeDay = fromMealType === WHOLE_DAY;
      const response = await fitnessGeekService.copyMeal(
        fromDate,
        toDate,
        wholeDay ? null : fromMealType,
        wholeDay ? null : (toMealType || null),
        fromUserId || null
      );

      // The gateway answers with the new log rows (`[{ id }]`).
      const ids = (Array.isArray(response) ? response : [])
        .map((r) => r?.id || r?._id)
        .filter(Boolean);
      if (Array.isArray(response) && ids.length === 0) {
        setError(`There was nothing in ${ownerWord} ${fromMealWords} on ${dayName(fromDate, today)} to copy.`);
        return;
      }

      const where = wholeDay
        ? dayName(toDate, today)
        : mealOnDayShort(mealWord(toMealType || fromMealType), toDate, today);
      const what = ids.length > 0 ? plural(ids.length, 'food') : null;
      offerUndo(`Copied to ${where} ✓${what ? ` · ${what}` : ''}`, ids, {
        onDeleted: () => onCopyComplete?.(toDate)
      });

      onCopyComplete?.(toDate);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t copy that. Try again.'));
    } finally {
      setCopying(false);
    }
  };

  // "Fill in: …" presets. They only fill the form; the summary below and the
  // Copy button do the copying. Every one lands on the day on screen —
  // never tomorrow (the old "Dinner → Tomorrow's Lunch" chip did).
  const previous = shiftDate(currentDate, -1);
  const prevWord = currentDate === today ? 'yesterday' : dayName(previous, today);
  const curWord = dayName(currentDate, today);
  const presets = [
    { key: 'dinner', label: `Fill in: ${prevWord}’s dinner → ${curWord}’s dinner`, meal: 'dinner' },
    { key: 'lunch', label: `Fill in: ${prevWord}’s lunch → ${curWord}’s lunch`, meal: 'lunch' },
    { key: 'all', label: `Fill in: all of ${prevWord} → ${curWord}`, meal: WHOLE_DAY },
  ];
  const fillIn = (preset) => {
    setFromDate(previous);
    setFromMealType(preset.meal);
    setToDate(currentDate);
    setToMealType('');
    setError('');
  };

  let summary;
  if (!fromMealType) {
    summary = 'Choose which meal to copy.';
  } else if (sameSpot) {
    summary = 'That’s the same meal. Pick another day or meal to copy from.';
  } else if (nothingThere) {
    summary = `There’s nothing in ${ownerWord} ${fromMealWords} on ${dayName(fromDate, today)}.`;
  } else {
    summary = copySummary({ whose, fromDate, fromMeal: fromMealType, toDate, toMeal: toMealType, count: sourceCount, today });
  }

  return (
    <PremiumDialog
      open={open}
      onClose={onClose}
      title="Copy a meal"
      icon={CopyIcon}
      maxWidth="sm"
      {...thumbSaveProps({
        fullScreen,
        save: (
          <Button
            variant="contained"
            onClick={handleCopy}
            disabled={!canCopy}
            startIcon={copying ? <CircularProgress size={20} color="inherit" /> : <CopyIcon />}
          >
            {copying ? 'Copying…' : 'Copy'}
          </Button>
        ),
        cancel: (
          <Button onClick={onClose} disabled={copying}>
            Cancel
          </Button>
        ),
      })}
    >
        {/* Presets that fill the form in */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
          {presets.map((preset) => (
            <Chip
              key={preset.key}
              label={preset.label}
              onClick={() => fillIn(preset)}
              variant="outlined"
              sx={{ height: 40, fontSize: '0.875rem' }}
            />
          ))}
        </Box>

        {/* Source */}
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Copy from
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          {/* Whose log — only when someone in the household shares theirs. */}
          {sharingMembers.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="copy-meal-from-user-label" shrink>Whose log</InputLabel>
              <Select
                labelId="copy-meal-from-user-label"
                value={fromUserId}
                onChange={(e) => setFromUserId(e.target.value)}
                label="Whose log"
                displayEmpty
                notched
              >
                <MenuItem value="">Mine</MenuItem>
                {sharingMembers.map(member => (
                  <MenuItem key={member.user_id} value={member.user_id}>
                    {member.display_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <DateField label="Day" value={fromDate} onChange={setFromDate} sx={{ minWidth: 150 }} />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="copy-meal-from-label" shrink>Which meal</InputLabel>
            <Select
              labelId="copy-meal-from-label"
              value={fromMealType}
              onChange={(e) => setFromMealType(e.target.value)}
              label="Which meal"
              displayEmpty
              notched
              renderValue={(v) => (v ? (v === WHOLE_DAY ? 'Whole day' : mealLabel(v)) : 'Choose a meal')}
            >
              {MEAL_TYPES.map(type => (
                <MenuItem key={type} value={type}>
                  {mealLabel(type)}
                </MenuItem>
              ))}
              <MenuItem value={WHOLE_DAY}>Whole day</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Destination */}
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Copy into
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <DateField label="Day" value={toDate} onChange={setToDate} sx={{ minWidth: 150 }} />
          {fromMealType === WHOLE_DAY ? (
            <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem' }}>
              Each meal goes into the same meal.
            </Typography>
          ) : (
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="copy-meal-to-label" shrink>Into which meal</InputLabel>
              <Select
                labelId="copy-meal-to-label"
                value={toMealType}
                onChange={(e) => setToMealType(e.target.value)}
                label="Into which meal"
                displayEmpty
                notched
              >
                <MenuItem value="">Same meal</MenuItem>
                {MEAL_TYPES.map(type => (
                  <MenuItem key={type} value={type}>
                    {mealLabel(type)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>

        {/* What will happen, in words */}
        <Box sx={{
          mt: 3,
          p: 2,
          bgcolor: 'action.hover',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider'
        }}>
          {/* action.hover is a tint over the dialog paper, not the paper: the
              summary read 4.4:1 as text.secondary before it was measured. */}
          <Typography
            data-testid="copy-summary"
            role="status"
            sx={(theme) => ({
              fontSize: '1rem',
              fontWeight: 600,
              color: fromMealType && !sameSpot && !nothingThere
                ? theme.palette.text.primary
                : readableOn(theme.palette.text.secondary, theme.palette.action.hover, {
                  under: theme.palette.background.paper,
                }),
            })}
          >
            {summary}
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
    </PremiumDialog>
  );
};

export default CopyMealDialog;
