import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { AutoAwesome as SparkleIcon, Search as SearchIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { GeekSheet } from '@geeksuite/ui';
import { quickAddService } from '../../services/quickAddService.js';
import { foodService } from '../../services/foodService.js';
import logger from '../../utils/logger.js';
import { provenanceLine } from '../../utils/quickAddProvenance.js';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const mealLabel = (meal) => meal.charAt(0).toUpperCase() + meal.slice(1);

/** Two identical taps must not be one tap: every control clears 44px. */
const TAP = 44;

const foodIdOf = (food) => food?.id ?? food?._id ?? null;

/**
 * NaturalLanguageQuickAdd — "what did you eat?" → a proposal, never a write.
 *
 * The shape of this feature (AI_IDEAS.md idea #2) is deliberately conservative
 * and the UI is where most of that lives:
 *
 *   - the gateway returns search **queries**, not foods, so every row on this
 *     card came out of the app's own catalog search. A query the catalog does
 *     not know shows "no match" and offers the ordinary search prefilled —
 *     never a made-up food.
 *   - nothing is logged until the person ticks rows and presses the one
 *     button, and each ticked row then goes through the ordinary
 *     `addFoodLog` path exactly as a hand-picked food does.
 *   - every proposal is labelled `AI-drafted` with a visible provenance line,
 *     including when no model was involved.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.defaultMealType    meal the Food Log page currently has selected
 * @param {(rows: Array<{food: object, servings: number, mealType: string}>) => Promise<{ok: number, fail: number}>} props.onLogRows
 * @param {(query: string, mealType: string) => void} props.onSearchFor  open the ordinary search, prefilled
 */
const NaturalLanguageQuickAdd = ({
  open,
  onClose,
  defaultMealType = 'snack',
  onLogRows,
  onSearchFor,
}) => {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState('input'); // 'input' | 'working' | 'proposal'
  const [rows, setRows] = useState([]);
  const [provenance, setProvenance] = useState(null);
  const [error, setError] = useState('');
  const [logging, setLogging] = useState(false);

  const reset = useCallback(() => {
    setText('');
    setPhase('input');
    setRows([]);
    setProvenance(null);
    setError('');
    setLogging(false);
  }, []);

  // A closed sheet keeps no draft: reopening asks the question again rather
  // than showing a proposal built from a sentence the user has forgotten.
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const checkedRows = useMemo(() => rows.filter((row) => row.checked && row.candidate), [rows]);

  const updateRow = (key, patch) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const handleParse = async () => {
    const sentence = text.trim();
    if (!sentence) return;
    setPhase('working');
    setError('');
    try {
      const { fragments, provenance: prov } = await quickAddService.parse(sentence);
      setProvenance(prov);
      if (!fragments.length) {
        setError('Nothing to log in that — try "two eggs and a slice of toast".');
        setPhase('input');
        return;
      }

      // The catalog is the only source of a food. One search per fragment,
      // in parallel; a search that fails is its own row state, never a
      // failure of the whole proposal.
      const searched = await Promise.all(
        fragments.map(async (fragment, index) => {
          const base = {
            key: `${index}-${fragment.query}`,
            fragment,
            servings: fragment.servings > 0 ? fragment.servings : 1,
            mealType: MEAL_TYPES.includes(fragment.mealType) ? fragment.mealType : defaultMealType,
          };
          try {
            const results = await foodService.search(fragment.query, { limit: 5 });
            const best = (results || []).find((item) => item && foodIdOf(item)) || null;
            return { ...base, candidate: best, status: best ? 'match' : 'nomatch', checked: Boolean(best) };
          } catch (err) {
            logger.debug('quick-add: search failed for', fragment.query, err);
            return { ...base, candidate: null, status: 'error', checked: false };
          }
        })
      );
      setRows(searched);
      setPhase('proposal');
    } catch (err) {
      logger.debug('quick-add: parse failed', err);
      setError('Could not read that just now. Try again, or use the ordinary search.');
      setPhase('input');
    }
  };

  const handleLog = async () => {
    if (!checkedRows.length || logging) return;
    setLogging(true);
    try {
      const result = await onLogRows?.(
        checkedRows.map((row) => ({
          food: row.candidate,
          servings: row.servings,
          mealType: row.mealType,
        }))
      );
      // The parent owns the toast and the refresh. A partial failure leaves
      // the sheet open so the rows that did not land are still visible.
      if (!result || !result.fail) onClose?.();
    } finally {
      setLogging(false);
    }
  };

  const inputStep = (
    <Box>
      <TextField
        fullWidth
        multiline
        minRows={2}
        maxRows={5}
        label="What did you eat?"
        placeholder="two eggs, toast with butter, black coffee"
        value={text}
        onChange={(event) => setText(event.target.value.slice(0, 500))}
        inputProps={{ maxLength: 500, 'data-testid': 'quick-add-text' }}
        helperText="One sentence. Nothing is logged until you say so."
        FormHelperTextProps={{ sx: { fontSize: '0.75rem' } }}
      />
      <Button
        fullWidth
        variant="contained"
        onClick={handleParse}
        disabled={!text.trim() || phase === 'working'}
        startIcon={phase === 'working' ? <CircularProgress size={18} color="inherit" /> : <SparkleIcon />}
        sx={{ mt: 2, minHeight: TAP }}
      >
        {phase === 'working' ? 'Reading…' : 'Read it'}
      </Button>
    </Box>
  );

  const proposalStep = (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Chip
          size="small"
          icon={<SparkleIcon sx={{ fontSize: 16 }} />}
          label="AI-drafted"
          sx={{ height: 24, fontSize: '0.75rem' }}
        />
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
          data-testid="quick-add-provenance"
        >
          {provenanceLine(provenance)}
        </Typography>
      </Box>

      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {rows.map((row) => {
          const name = row.candidate?.name || row.fragment.text;
          const brand = row.candidate?.brand;
          const matched = Boolean(row.candidate);
          return (
            <Box
              component="li"
              key={row.key}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                py: 1.25,
                borderBottom: `1px solid ${theme.palette.divider}`,
                '&:last-of-type': { borderBottom: 'none' },
              }}
            >
              <Checkbox
                checked={Boolean(row.checked && matched)}
                disabled={!matched}
                onChange={(event) => updateRow(row.key, { checked: event.target.checked })}
                inputProps={{ 'aria-label': `Log ${name}` }}
                sx={{ width: TAP, height: TAP, mt: -0.5 }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', wordBreak: 'break-word' }}>
                  {name}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ display: 'block', color: 'text.secondary', fontSize: '0.75rem' }}
                >
                  {matched
                    ? [brand, row.candidate?.source].filter(Boolean).join(' · ') || 'your catalog'
                    : row.status === 'error'
                      ? 'search failed — try it by hand'
                      : 'no match'}
                  {matched ? ` · from “${row.fragment.text}”` : ''}
                </Typography>

                {matched ? (
                  <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                    <TextField
                      type="number"
                      size="small"
                      label="Servings"
                      value={row.servings}
                      onChange={(event) => {
                        const next = parseFloat(event.target.value);
                        updateRow(row.key, { servings: Number.isFinite(next) && next > 0 ? next : '' });
                      }}
                      onBlur={() => {
                        if (!row.servings) updateRow(row.key, { servings: 1 });
                      }}
                      inputProps={{
                        min: 0.1,
                        step: 0.25,
                        'aria-label': `Servings of ${name}`,
                        style: { fontSize: '0.875rem' },
                      }}
                      sx={{ width: 108, '& .MuiInputBase-root': { minHeight: TAP } }}
                    />
                    <FormControl size="small" sx={{ minWidth: 132 }}>
                      <InputLabel id={`meal-${row.key}`}>Meal</InputLabel>
                      <Select
                        labelId={`meal-${row.key}`}
                        label="Meal"
                        value={row.mealType}
                        onChange={(event) => updateRow(row.key, { mealType: event.target.value })}
                        inputProps={{ 'aria-label': `Meal for ${name}` }}
                        sx={{ minHeight: TAP, fontSize: '0.875rem' }}
                      >
                        {MEAL_TYPES.map((meal) => (
                          <MenuItem key={meal} value={meal} sx={{ minHeight: TAP }}>
                            {mealLabel(meal)}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                ) : (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<SearchIcon />}
                    onClick={() => onSearchFor?.(row.fragment.query, row.mealType)}
                    sx={{ mt: 1, minHeight: TAP, textTransform: 'none' }}
                  >
                    {`Search “${row.fragment.query}”`}
                  </Button>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      <Button
        size="small"
        onClick={reset}
        sx={{ mt: 1, minHeight: TAP, textTransform: 'none' }}
      >
        Start over
      </Button>
    </Box>
  );

  return (
    <GeekSheet
      open={Boolean(open)}
      onClose={onClose}
      title="Quick add"
      description="Type what you ate. You get a proposal to check — nothing is logged until you press the button."
      initialFocus={phase === 'input' ? 'input, textarea' : undefined}
      actions={
        phase === 'proposal' ? (
          <Button
            fullWidth
            variant="contained"
            onClick={handleLog}
            disabled={!checkedRows.length || logging}
            sx={{ minHeight: TAP }}
          >
            {logging
              ? 'Logging…'
              : `Log ${checkedRows.length} item${checkedRows.length === 1 ? '' : 's'}`}
          </Button>
        ) : null
      }
    >
      {error ? (
        <Alert severity="warning" sx={{ mb: 2, fontSize: '0.8125rem' }} onClose={() => setError('')}>
          {error}
        </Alert>
      ) : null}
      {phase === 'proposal' ? proposalStep : inputStep}
    </GeekSheet>
  );
};

export default NaturalLanguageQuickAdd;
