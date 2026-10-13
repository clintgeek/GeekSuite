import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import { foodService } from '../../services/foodService.js';

const kcal = (food) => Math.round(Number(food?.nutrition?.calories_per_serving) || 0);

const servingText = (food) => {
  const size = food?.serving?.size ?? food?.serving_size;
  const unit = food?.serving?.unit ?? food?.serving_unit;
  return size ? `${Math.round(Number(size) * 10) / 10}${unit || ''}` : null;
};

/**
 * Ingredient search for the recipe builder: the same two waves the food
 * logger uses — the local typeahead as you type, then "Search more" for the
 * deep (external + AI) search. Picking a row hands the food to the builder.
 */
const IngredientPicker = ({ open, onClose, onPick, title = 'Add an ingredient' }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setResults([]);
    setSearched(false);
    return undefined;
  }, [open]);

  // Wave one: local typeahead, 150ms after you stop typing.
  useEffect(() => {
    if (!open) return undefined;
    const id = ++run.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const foods = await foodService.suggest(query, { limit: 15 });
        if (run.current === id) setResults(foods || []);
      } catch {
        // A failed typeahead is not fatal — "Search more" may still answer.
      } finally {
        if (run.current === id) {
          setBusy(false);
          setSearched(true);
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [open, query]);

  const deep = async () => {
    const id = ++run.current;
    setBusy(true);
    try {
      const foods = await foodService.search(query, { limit: 25, includeAI: true });
      if (run.current === id) setResults(foods || []);
    } catch {
      // keep the typeahead results on screen
    } finally {
      if (run.current === id) {
        setBusy(false);
        setSearched(true);
      }
    }
  };

  return (
    <PremiumDialog
      open={open}
      onClose={onClose}
      eyebrow="Recipe"
      title={title}
      maxWidth="sm"
      secondaryAction={<Button onClick={onClose}>Cancel</Button>}
    >
      <TextField
        fullWidth
        autoFocus
        size="small"
        label="Search foods"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ mb: 2 }}
      />
      <Box role="list" aria-label="Matching foods" sx={{ display: 'flex', flexDirection: 'column' }}>
        {results.map((food, i) => (
          <Box
            role="listitem"
            key={food.id || food._id || `${food.source}-${food.name}-${i}`}
            sx={{ display: 'flex' }}
          >
            <Button
              fullWidth
              onClick={() => onPick(food)}
              sx={{
                justifyContent: 'space-between',
                textAlign: 'left',
                textTransform: 'none',
                color: 'text.primary',
                minHeight: 52,
                px: 1.5,
                gap: 2,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>{food.name}</Typography>
                <Typography noWrap sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>
                  {[food.brand, servingText(food)].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              <Typography sx={{ fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {kcal(food)} kcal
              </Typography>
            </Button>
          </Box>
        ))}
      </Box>
      {busy && <CircularProgress size={20} aria-label="Searching" sx={{ display: 'block', mx: 'auto', my: 2 }} />}
      {!busy && searched && results.length === 0 && (
        <Typography sx={{ color: 'text.secondary', py: 2 }}>
          Nothing in your own foods matches. Try Search more.
        </Typography>
      )}
      {query.trim() && (
        <Button onClick={deep} disabled={busy} sx={{ mt: 1 }}>
          Search more
        </Button>
      )}
    </PremiumDialog>
  );
};

export default IngredientPicker;
