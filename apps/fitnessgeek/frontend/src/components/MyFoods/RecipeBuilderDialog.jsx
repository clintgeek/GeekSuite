import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Close as RemoveIcon,
  ContentPaste as PasteIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';
import { useToast } from '@geeksuite/ui';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import SectionLabel from '../primitives/SectionLabel.jsx';
import IngredientPicker from './IngredientPicker.jsx';
import { foodService } from '../../services/foodService.js';
import { errorMessage } from '../../utils/errorMessage.js';
import {
  ingredientFromFood,
  ingredientFromParsed,
  ingredientFromSaved,
  rowCalories,
  summarize,
  toRecipeInput,
  unitOptions,
  withAmount,
  withUnit,
} from '../../utils/recipeBuilder.js';
import { formatServing } from '../../utils/units.js';
import { fmt, macroLine } from '../../utils/plainWords.js';

// No protein, carbs or fat on any ingredient means "not known", not zero
// (review U-4): the builder used to print "P 0g · C 0g · F 0g".
const macrosKnown = (per) => ['protein_grams', 'carbs_grams', 'fat_grams'].some((k) => Number(per?.[k]) > 0);

/**
 * The recipe builder (DOCS/RECIPES_PLAN.md §2–3): a custom food that remembers
 * its ingredients. Full-screen on a phone (PremiumDialog -> GeekDialog).
 *
 * `food` is the saved recipe being edited, or absent for "New recipe".
 * The preview runs the same maths the gateway uses to store the totals.
 */
const RecipeBuilderDialog = ({ open, food, onClose, onSaved }) => {
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [rows, setRows] = useState([]);
  const [yieldText, setYieldText] = useState('');
  const [saving, setSaving] = useState(false);
  const [pickerFor, setPickerFor] = useState(null); // null | 'new' | row key
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);

  // Fresh state each time the sheet opens (pre-filled when editing).
  useEffect(() => {
    if (!open) return;
    setName(food?.name || '');
    setRows((food?.recipe?.ingredients || []).map(ingredientFromSaved));
    setYieldText(food?.recipe?.yield_servings != null ? String(food.recipe.yield_servings) : '');
    setPickerFor(null);
    setPasteOpen(false);
    setPasteText('');
  }, [open, food]);

  const summary = useMemo(
    () => summarize({ name, rows, yieldServings: yieldText }),
    [name, rows, yieldText]
  );

  const patchRow = (key, fn) => setRows((rs) => rs.map((r) => (r.key === key ? fn(r) : r)));
  const removeRow = (key) => setRows((rs) => rs.filter((r) => r.key !== key));

  const handlePick = (picked) => {
    if (pickerFor && pickerFor !== 'new') {
      setRows((rs) => rs.map((r) => (r.key === pickerFor ? ingredientFromFood(picked, r) : r)));
    } else {
      setRows((rs) => [...rs, ingredientFromFood(picked)]);
    }
    setPickerFor(null);
  };

  const handleParse = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    try {
      const parsed = await foodService.parseRecipe(pasteText);
      setRows((rs) => [...rs, ...parsed.map(ingredientFromParsed)]);
      setPasteText('');
      setPasteOpen(false);
    } catch (err) {
      notify(errorMessage(err, 'Couldn’t read that ingredient list. Try again.'), { tone: 'error' });
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (!summary.canSave) return;
    setSaving(true);
    try {
      // FitnessFoodInput still requires serving + nutrition; the server
      // recomputes nutrition from `recipe` and ignores ours.
      const input = {
        name: name.trim(),
        serving_size: 1,
        serving_unit: 'serving',
        nutrition: summary.perServing,
        recipe: toRecipeInput(rows, yieldText),
      };
      if (food?.id ?? food?._id) await foodService.update(food.id ?? food._id, input);
      else await foodService.create(input);
      notify(`Saved ${input.name}`, { tone: 'success' });
      onSaved?.();
      onClose();
    } catch (err) {
      notify(errorMessage(err, 'Couldn’t save that recipe. Try again.'), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const batchKcal = Math.round(summary.totals.calories_per_serving || 0);
  const per = summary.perServing;

  return (
    <>
      <PremiumDialog
        open={open}
        onClose={onClose}
        title={food ? `Edit ${food.name ?? 'recipe'}` : 'New recipe'}
        maxWidth="sm"
        primaryAction={
          <Button variant="contained" onClick={handleSave} disabled={!summary.canSave || saving}>
            {saving ? <CircularProgress size={20} aria-label="Saving" /> : 'Save recipe'}
          </Button>
        }
        secondaryAction={<Button onClick={onClose}>Cancel</Button>}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            fullWidth
            required
            label="Recipe name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Box>
            <SectionLabel count={rows.length} sx={{ mb: 1 }}>Ingredients</SectionLabel>
            <Box component="ul" aria-label="Ingredients" sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {rows.map((row) => (
                <Box
                  component="li"
                  key={row.key}
                  sx={{
                    py: 1.5,
                    borderBottom: (t) => `1px dashed ${t.palette.divider}`,
                  }}
                >
                  {row.unresolved ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <WarningIcon sx={{ color: 'warning.main', flexShrink: 0 }} aria-hidden />
                      <Typography sx={{ flex: 1, minWidth: 0, color: 'text.primary' }}>
                        Couldn’t match &ldquo;{row.line || row.name}&rdquo;
                      </Typography>
                      <Button size="small" variant="outlined" onClick={() => setPickerFor(row.key)}>
                        Pick a food
                      </Button>
                      <IconButton
                        size="small"
                        aria-label={`Remove ${row.line || row.name}`}
                        onClick={() => removeRow(row.key)}
                      >
                        <RemoveIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ) : (
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 600 }} noWrap title={row.name}>
                          {row.name}
                        </Typography>
                        {row.estimated && (
                          <Chip label="estimate" size="small" variant="outlined" sx={{ flexShrink: 0 }} />
                        )}
                        <IconButton
                          size="small"
                          aria-label={`Remove ${row.name}`}
                          onClick={() => removeRow(row.key)}
                        >
                          <RemoveIcon fontSize="small" />
                        </IconButton>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                        <TextField
                          size="small"
                          type="number"
                          label="Amount"
                          value={row.amount}
                          onChange={(e) => patchRow(row.key, (r) => withAmount(r, e.target.value))}
                          inputProps={{ min: 0, step: 'any', inputMode: 'decimal', 'aria-label': `Amount of ${row.name}` }}
                          sx={{ width: 120 }}
                        />
                        <TextField
                          select
                          size="small"
                          label="Unit"
                          value={row.unit}
                          onChange={(e) => patchRow(row.key, (r) => withUnit(r, e.target.value))}
                          SelectProps={{ native: true }}
                          inputProps={{ 'aria-label': `Unit for ${row.name}` }}
                          sx={{ width: 110 }}
                        >
                          {unitOptions(row).map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </TextField>
                        <Typography
                          sx={{ ml: 'auto', fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                        >
                          {fmt(rowCalories(row))} cal
                        </Typography>
                      </Box>
                      {row.unitMismatch && (
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mt: 1 }}>
                          <WarningIcon fontSize="small" sx={{ color: 'warning.main', mt: '2px' }} aria-hidden />
                          <Typography sx={{ fontSize: '0.8125rem', color: 'text.primary' }}>
                            That unit doesn’t match this food’s serving ({formatServing(row.serving_size, row.serving_unit)}), so the amount is a guess. Pick a unit that fits.
                          </Typography>
                        </Box>
                      )}
                    </>
                  )}
                </Box>
              ))}
            </Box>
            {rows.length === 0 && (
              <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', py: 1 }}>
                No ingredients yet. Add them one at a time, or paste a list.
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setPickerFor('new')}>
                Add ingredient
              </Button>
              <Button variant="outlined" startIcon={<PasteIcon />} onClick={() => setPasteOpen((v) => !v)}>
                Paste ingredients
              </Button>
            </Box>
          </Box>

          {pasteOpen && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <TextField
                multiline
                minRows={4}
                fullWidth
                label="Ingredient list"
                helperText="One ingredient per line, e.g. 2 lb ground beef"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="contained" onClick={handleParse} disabled={parsing || !pasteText.trim()}>
                  {parsing ? <CircularProgress size={20} aria-label="Reading list" /> : 'Add to recipe'}
                </Button>
                <Button onClick={() => setPasteOpen(false)}>Cancel paste</Button>
              </Box>
            </Box>
          )}

          <TextField
            label="Makes (servings)"
            type="number"
            value={yieldText}
            onChange={(e) => setYieldText(e.target.value)}
            inputProps={{ min: 0, step: 'any', inputMode: 'decimal' }}
            required
            sx={{ maxWidth: 200 }}
          />

          <Box
            aria-live="polite"
            sx={{
              border: (t) => `1px dashed ${t.palette.divider}`,
              borderRadius: 2,
              p: 2,
            }}
          >
            {per ? (
              <>
                <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(per.calories_per_serving)} cal per serving
                </Typography>
                <Typography sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                  {macrosKnown(per) ? macroLine({ protein: per.protein_grams, carbs: per.carbs_grams, fat: per.fat_grams }) : macroLine({})}
                </Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mt: 0.5 }}>
                  Whole batch {fmt(batchKcal)} cal
                </Typography>
              </>
            ) : (
              <Typography sx={{ color: 'text.secondary' }}>
                Say how many servings it makes to see the numbers.
              </Typography>
            )}
          </Box>
        </Box>
      </PremiumDialog>

      <IngredientPicker
        open={open && pickerFor != null}
        title={pickerFor && pickerFor !== 'new' ? 'Pick a food' : 'Add an ingredient'}
        onClose={() => setPickerFor(null)}
        onPick={handlePick}
      />
    </>
  );
};

export default RecipeBuilderDialog;
