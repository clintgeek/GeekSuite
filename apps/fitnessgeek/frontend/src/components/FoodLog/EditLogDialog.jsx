import React, { useState, useEffect, useMemo } from 'react';
import {
  Button,
  TextField,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Slider,
  Collapse
} from '@mui/material';
import NutritionInputs from './NutritionInputs.jsx';
import { useGeekDialogFullScreen } from '@geeksuite/ui';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import DateField from '../primitives/DateField.jsx';
import { thumbSaveProps } from '../BloodPressure/thumbSave.jsx';
import { rowDay } from '../../utils/experience.js';
import { fmt, mealLabel } from '../../utils/plainWords.js';
import { foodService } from '../../services/foodService.js';
import {
  Restaurant as FoodIcon,
  DeleteOutline as RemoveIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  ExpandMore as ExpandIcon
} from '@mui/icons-material';

const PARTIAL_NUMBER = /^\d*[.,]?\d*$/;
const toNumber = (raw) => Number.parseFloat(String(raw ?? '').replace(',', '.'));
const round = (v, p = 1) => Math.round((Number(v) || 0) * 10 ** p) / 10 ** p;
const MAX_CALORIES = 10000;
const MACROS = ['protein_grams', 'carbs_grams', 'fat_grams'];

/**
 * Edit one logged entry: how much, which meal, which day, and — the one that
 * was missing (REVIEW_2026-10 Phase 2.12) — what it came to.
 *
 * A described meal is an estimate. "1.5 servings of a bowl of chicken soup"
 * is not a question anyone can answer, so the calorie number itself is
 * editable. The dialog asks for the entry's calories as a whole first ("this
 * was about 300"); the per-serving numbers and the macros sit behind "Per
 * serving and nutrition", closed. Either way they go out as the gateway's
 * per-serving overrides (CONTRACTS C3: `calories`, `protein_grams`,
 * `carbs_grams`, `fat_grams`), and only the ones that changed. The food in the
 * catalog is never touched.
 *
 * "Day" moves the entry (`log_date`), which is how last night's dinner logged
 * this morning gets back to last night.
 *
 * Save sits at the bottom on a phone (thumbSaveProps, UX review L9): with the
 * keyboard up, the only button she could see was ✕, which reads as cancel.
 * "Remove" lives here too (`onRemove`), because the rows have no trash icon
 * any more (L15); the page shows the usual "Removed X" toast with Undo.
 *
 * So does the favorite star, for the same reason (ONE_APP_PLAN.md): the
 * dialog reads whether this food is a favorite when it opens and toggles it
 * itself. The button stays off until that read answers, so it never offers
 * "Add to favorites" for a food that already is one; a failed toggle puts
 * the star back and says so.
 */
const EditLogDialog = ({
  open,
  onClose,
  onSave,
  log,
  loading = false,
  onRemove
}) => {
  const fullScreen = useGeekDialogFullScreen();
  const [servings, setServings] = useState('1');
  const [mealType, setMealType] = useState('dinner');
  const [notes, setNotes] = useState('');
  const [day, setDay] = useState('');
  // The whole entry's calories, as typed.
  const [totalCalories, setTotalCalories] = useState('');
  // Which number the person last set, so only that one goes out: the entry's
  // total ('total') or the per-serving calories in the disclosure ('serving').
  const [calorieSource, setCalorieSource] = useState('total');
  const [detailOpen, setDetailOpen] = useState(false);
  // null = not known yet (or couldn't be read): the button waits.
  const [favorite, setFavorite] = useState(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteError, setFavoriteError] = useState(false);
  const favoriteFood = log?.food_item || log?.food_item_id;
  const favoriteFoodId = favoriteFood && typeof favoriteFood === 'object' ? (favoriteFood._id || favoriteFood.id) : null;

  useEffect(() => {
    setFavorite(null);
    setFavoriteError(false);
    if (!open || !favoriteFoodId) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => foodService.getFavorites())
      .then((favorites) => {
        if (cancelled) return;
        const list = Array.isArray(favorites) ? favorites : (favorites?.data || []);
        setFavorite(list.some((f) => String(f?._id || f?.id) === String(favoriteFoodId)));
      })
      .catch(() => { /* unknown: the button stays off */ });
    return () => { cancelled = true; };
  }, [open, favoriteFoodId]);

  const toggleFavorite = async () => {
    if (favorite === null || favoriteBusy || !favoriteFoodId) return;
    const next = !favorite;
    setFavorite(next);
    setFavoriteBusy(true);
    setFavoriteError(false);
    try {
      if (next) await foodService.addFavorite(favoriteFoodId);
      else await foodService.removeFavorite(favoriteFoodId);
    } catch {
      setFavorite(!next);
      setFavoriteError(true);
    } finally {
      setFavoriteBusy(false);
    }
  };
  const [nutrition, setNutrition] = useState({
    calories_per_serving: 0,
    protein_grams: 0,
    carbs_grams: 0,
    fat_grams: 0
  });

  const food_item_ref = log?.food_item || log?.food_item_id;
  const initialNutrition = useMemo(() => (
    (log?.nutrition && Object.keys(log.nutrition).length > 0 ? log.nutrition : null)
    || food_item_ref?.nutrition
    || { calories_per_serving: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 }
  ), [log, food_item_ref]);
  const initialServings = Number(log?.servings) > 0 ? Number(log.servings) : 1;
  const initialDay = rowDay(log) || '';
  const initialTotal = Math.round((Number(initialNutrition.calories_per_serving) || 0) * initialServings);

  useEffect(() => {
    if (log) {
      setServings(log.servings?.toString() || '1');
      setMealType(log.meal_type || 'dinner');
      setNotes(log.notes || '');
      setNutrition(initialNutrition);
      setDay(initialDay);
      setTotalCalories(String(initialTotal));
      setCalorieSource('total');
      setDetailOpen(false);
    }
  }, [log]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when a different entry opens

  const servingsCount = toNumber(servings);
  const servingsOk = Number.isFinite(servingsCount) && servingsCount > 0;
  const typedTotal = toNumber(totalCalories);
  const totalOk = Number.isFinite(typedTotal) && typedTotal >= 0 && typedTotal <= MAX_CALORIES * (servingsOk ? servingsCount : 1);
  const perServingOk = Number(nutrition.calories_per_serving) >= 0 && Number(nutrition.calories_per_serving) <= MAX_CALORIES;
  const caloriesOk = calorieSource === 'total' ? totalOk : perServingOk;
  const dayOk = /^\d{4}-\d{2}-\d{2}$/.test(day);
  const canSave = Boolean(log) && !loading && servingsOk && caloriesOk && dayOk;

  // What the entry comes to with the numbers on screen.
  const perServingCalories = calorieSource === 'total'
    ? (totalOk && servingsOk ? typedTotal / servingsCount : Number(initialNutrition.calories_per_serving) || 0)
    : Number(nutrition.calories_per_serving) || 0;

  const handleSave = () => {
    if (!canSave) return;
    const updateData = {
      servings: servingsCount,
      meal_type: mealType,
      notes: notes.trim()
    };
    if (day !== initialDay) updateData.log_date = day;

    // Only what changed goes out — an override that repeats the old number
    // is still an override, and it would pin a value the person never set.
    const changed = (key) => round(nutrition[key], 2) !== round(initialNutrition[key], 2);
    if (calorieSource === 'total') {
      const per = round(typedTotal / servingsCount, 2);
      if (per !== round(initialNutrition.calories_per_serving, 2)) updateData.calories = per;
    } else if (changed('calories_per_serving')) {
      updateData.calories = Math.max(0, round(nutrition.calories_per_serving, 2));
    }
    for (const key of MACROS) {
      if (changed(key)) updateData[key] = Math.max(0, round(nutrition[key], 2));
    }
    onSave(log._id || log.id, updateData);
  };

  // The total is the entry's, so more servings means a bigger total — the
  // same food, more of it — unless she then types her own number.
  const changeServings = (next) => {
    const prev = toNumber(servings);
    const n = toNumber(next);
    if (calorieSource === 'total') {
      if (totalOk && prev > 0 && n > 0) setTotalCalories(String(Math.round((typedTotal / prev) * n)));
    } else if (n > 0) {
      setTotalCalories(String(Math.round((Number(nutrition.calories_per_serving) || 0) * n)));
    }
    setServings(next);
  };

  // Typing the total keeps the per-serving box in step, for show; what goes
  // out is decided by `calorieSource`.
  const changeTotal = (next) => {
    setTotalCalories(next);
    setCalorieSource('total');
    const t = toNumber(next);
    if (Number.isFinite(t) && servingsOk) {
      setNutrition((prev) => ({ ...prev, calories_per_serving: round(t / servingsCount, 2) }));
    }
  };

  const handleClose = () => {
    onClose();
  };

  const food_item = log?.food_item || log?.food_item_id;

  const setNutritionField = (field, value) => {
    const v = parseFloat(value);
    if (field === 'calories_per_serving') {
      setCalorieSource('serving');
      if (servingsOk) setTotalCalories(String(Math.round((Number.isFinite(v) ? v : 0) * servingsCount)));
    }
    setNutrition((prev) => ({
      ...prev,
      [field]: Number.isFinite(v) ? v : 0
    }));
  };

  const mealTypeOptions = [
    { value: 'breakfast', label: mealLabel('breakfast') },
    { value: 'lunch', label: mealLabel('lunch') },
    { value: 'dinner', label: mealLabel('dinner') },
    { value: 'snack', label: mealLabel('snack') }
  ];

  return (
    <PremiumDialog
      open={open}
      onClose={handleClose}
      title="Edit entry"
      maxWidth="sm"
      {...thumbSaveProps({
        fullScreen,
        save: (
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={!canSave}
          >
            {loading ? 'Saving…' : 'Save'}
          </Button>
        ),
        cancel: (
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
        ),
      })}
    >
        <Box sx={{ mb: 3 }}>
          {/* Food Item Info */}
          {food_item && (
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              mb: 3,
              pb: 2,
              borderBottom: (t) => `1px solid ${t.palette.divider}`
            }}>
              <FoodIcon sx={{ fontSize: 32, color: 'primary.main' }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6">
                  {food_item.name}
                </Typography>
              </Box>
            </Box>
          )}

          {/* One number, the whole entry — what she remembers. */}
          <TextField
              fullWidth
              label="Calories"
              value={totalCalories}
              onChange={(e) => {
                const next = e.target.value.trim();
                if (PARTIAL_NUMBER.test(next)) changeTotal(next);
              }}
              error={calorieSource === 'total' ? totalCalories !== '' && !totalOk : !perServingOk}
              helperText={calorieSource === 'total' && totalCalories !== '' && !totalOk ? 'That looks too high. Check the number.' : 'For this whole entry.'}
              inputProps={{ inputMode: 'decimal', autoComplete: 'off' }}
              sx={{ mb: 4 }}
            />

          {/* Servings */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>Servings</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Slider
                value={parseFloat(servings) || 1}
                onChange={(e, val) => changeServings(String(val))}
                min={0.25}
                max={10}
                step={0.25}
                aria-label="Servings"
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                value={servings}
                onChange={(e) => {
                  const next = e.target.value.trim();
                  if (PARTIAL_NUMBER.test(next)) changeServings(next);
                }}
                inputProps={{ inputMode: 'decimal', autoComplete: 'off', 'aria-label': 'Servings' }}
                sx={{ width: 100 }}
              />
            </Box>
          </Box>

          {/* Day — moves the entry. */}
          <DateField
            label="Day"
            value={day}
            onChange={setDay}
            fullWidth
            size="medium"
            sx={{ mb: 4 }}
          />

          {/* Meal Type */}
          <FormControl fullWidth sx={{ mb: 4 }}>
            <InputLabel id="edit-log-meal-label">Meal</InputLabel>
            <Select
              labelId="edit-log-meal-label"
              value={mealType}
              label="Meal"
              onChange={(e) => setMealType(e.target.value)}
            >
              {mealTypeOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Notes */}
          <TextField
            fullWidth
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={2}
            placeholder="Anything to remember about this food…"
          />

          {/* Per serving and nutrition — everything the total hides, closed. */}
          <Button
            onClick={() => setDetailOpen((o) => !o)}
            aria-expanded={detailOpen}
            aria-controls="edit-log-detail"
            endIcon={<ExpandIcon sx={{ transform: detailOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />}
            sx={{ mt: 2, minHeight: 44, px: 0, fontWeight: 700, justifyContent: 'flex-start' }}
          >
            Per serving and nutrition
          </Button>
          <Collapse in={detailOpen} unmountOnExit>
            <Box id="edit-log-detail" sx={{ mt: 3 }}>
              {/* These fields hold PER-SERVING numbers — the same object the
                  "Nutrition for N servings" preview below multiplies by
                  `servings`. Plain "Calories" here would read as the total
                  someone remembers eating (that is the field above), so the
                  qualifier makes the units explicit at the point of entry. */}
              <NutritionInputs
                values={nutrition}
                onChange={(field, val) => setNutritionField(field, val)}
                qualifier=" (per serving)"
              />
              <Box sx={{ mt: 4 }}>
                <Typography variant="body2" fontWeight={600} gutterBottom>
                  Nutrition for {servings} serving{parseFloat(servings) !== 1 ? 's' : ''}:
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Chip
                    label={`${fmt(perServingCalories * (servingsOk ? servingsCount : 0))} cal`}
                    size="small"
                    variant="tag"
                  />
                  <Chip
                    label={`Protein ${fmt(nutrition.protein_grams * parseFloat(servings))}g`}
                    size="small"
                    variant="tag"
                  />
                  <Chip
                    label={`Carbs ${fmt(nutrition.carbs_grams * parseFloat(servings))}g`}
                    size="small"
                    variant="tag"
                  />
                  <Chip
                    label={`Fat ${fmt(nutrition.fat_grams * parseFloat(servings))}g`}
                    size="small"
                    variant="tag"
                  />
                </Box>
              </Box>
            </Box>
          </Collapse>

          {/* Favorite and Remove — the row's star and trash icons, moved in
              here. Undo for a removal is in the toast. */}
          {log && (favoriteFoodId || onRemove) && (
            <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 2 }}>
                {favoriteFoodId && (
                  <Button
                    color="inherit"
                    data-testid="edit-log-favorite"
                    startIcon={favorite ? <StarIcon sx={{ color: 'warning.main' }} /> : <StarBorderIcon />}
                    onClick={toggleFavorite}
                    disabled={loading || favoriteBusy || favorite === null}
                    aria-pressed={Boolean(favorite)}
                    sx={{ minHeight: 48 }}
                  >
                    {favorite ? 'In your favorites' : 'Add to favorites'}
                  </Button>
                )}
                {onRemove && (
                  <Button
                    color="error"
                    startIcon={<RemoveIcon />}
                    onClick={() => onRemove(log._id || log.id)}
                    disabled={loading}
                    aria-label={food_item?.name ? `Remove ${food_item.name}` : 'Remove'}
                    sx={{ minHeight: 48 }}
                  >
                    Remove
                  </Button>
                )}
              </Box>
              {favoriteError && (
                <Typography role="alert" sx={{ mt: 1, fontSize: '0.9375rem', color: 'error.main' }}>
                  Couldn’t change that just now. Try again.
                </Typography>
              )}
            </Box>
          )}
        </Box>
    </PremiumDialog>
  );
};

export default EditLogDialog;