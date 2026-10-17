import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Box, Typography, Skeleton, LinearProgress, Collapse, ButtonBase } from '@mui/material';
import {
  AddCircleOutline as CreateIcon,
  ExpandMore as ExpandIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import FoodResultRow from './FoodResultRow';
import { foodService } from '../../services/foodService';
import { errorMessage } from '../../utils/errorMessage.js';
import { identityOf } from './entries.js';
import SignInButton, { isSignedOutMessage } from './SignInButton.jsx';

/**
 * The "exact food" list: the half of the composer you ask for.
 *
 * FoodComposer owns the box, the sentence and everything that writes; this
 * owns the two search waves and the rows. It used to be the whole surface,
 * with the list first and describing as a pale row inside it
 * (REVIEW_2026-10 §4). See FoodComposer.jsx for the surface it now serves.
 *
 * THE TWO WAVES.
 *
 *   Wave one (150ms after you stop typing) hits `/foods/suggest` — your own
 *   catalog, favourites, recents, custom foods, and (with `meals=1`) up to
 *   three of your saved meals. No network beyond our own Mongo, so it paints
 *   while you are still typing.
 *
 *   Wave two (400ms) hits `/foods?search=` — the food APIs and, where it earns
 *   its place, the model. It never runs under three characters ("Ha" used to
 *   come back with "hal PICKLED BABY BEETROOT", §2), and never for a sentence
 *   unless the list has been opened: typing "a bowl of chicken soup" word by
 *   word used to fire a model call on every pause.
 *
 * NOTHING MOVES UNDER A FINGER OR A POINTER. Chef: "the entry form bounces
 * around a lot on the desktop". For one query, the order of rows is fixed the
 * first time they are shown: a later batch is appended (or merged into a row
 * already there), never sorted in above. The progress bar has its own reserved
 * line, and the "couldn't reach the databases" note sits under the list, so
 * neither pushes rows down when it appears.
 *
 * SENTENCE MODE. When the box holds a sentence, the list folds into
 * "Or pick an exact food (n)". "Nothing found" never shows — there is no
 * such thing as nothing found for a sentence describe-and-log can read — and
 * the "Create '<sentence>'" row is hidden.
 */

const DEBOUNCE_LOCAL_MS = 150;
const DEBOUNCE_DEEP_MS = 400;
const MIN_DEEP = 3;

/** A saved meal from suggest logs through `logMeal` (useFoodLogging's `type: 'meal'` branch). */
const asRow = (row) => (row?.kind === 'meal' ? { ...row, type: 'meal' } : row);

const UnifiedFoodSearch = ({
  query = '',
  sentence = false,
  describeAvailable = false,
  collapseIdleList = false,
  ketoMode = false,
  dense = false,
  busy = false,
  pendingKey = null,
  // `{ [rowKey]: { servings } }`: what this sitting has written per row, so
  // a row can say "2 added ✓" and offer "Make it 3" (L2).
  added = null,
  onPick,
  onAdjust,
  onMore,
  onCreateFood,
}) => {
  const theme = useTheme();
  const muted = theme.palette.text.secondary;
  const ink = theme.palette.text.primary;

  const [suggestions, setSuggestions] = useState([]);
  const [deepResults, setDeepResults] = useState([]);
  const [loadingDeep, setLoadingDeep] = useState(false);
  const [error, setError] = useState(null);
  // Folded lists, closed on arrival every time and deliberately not
  // remembered: the fold is about what the screen is for, not a preference.
  const [idleListOpen, setIdleListOpen] = useState(false);
  const [sentenceListOpen, setSentenceListOpen] = useState(false);

  const localAbort = useRef(null);
  const deepAbort = useRef(null);
  const deepTimer = useRef(null);
  // The query the deep results on screen are allowed to belong to.
  const deepFor = useRef('');

  const text = String(query || '').trim();
  const searching = text.length > 0;
  const wantDeep = text.length >= MIN_DEEP && (!sentence || sentenceListOpen);

  // A new sentence starts folded again.
  useEffect(() => { if (!sentence) setSentenceListOpen(false); }, [sentence]);

  // ── Wave one: the local catalog, on every pause ──────────────────────
  useEffect(() => {
    const handle = setTimeout(async () => {
      localAbort.current?.abort();
      const controller = new AbortController();
      localAbort.current = controller;
      try {
        const foods = await foodService.suggest(text, { limit: 15, signal: controller.signal, meals: true });
        if (!controller.signal.aborted) setSuggestions(Array.isArray(foods) ? foods.map(asRow) : []);
      } catch (err) {
        if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
          // A failed suggest is not a failed search — wave two may still answer.
          setSuggestions([]);
        }
      }
    }, DEBOUNCE_LOCAL_MS);
    return () => clearTimeout(handle);
  }, [text]);

  // ── Wave two: the food APIs, on a longer pause ───────────────────────
  const runDeepSearch = useCallback(async (term) => {
    deepAbort.current?.abort();
    const controller = new AbortController();
    deepAbort.current = controller;
    deepFor.current = term;

    setLoadingDeep(true);
    setError(null);
    try {
      const foods = await foodService.search(term, { limit: 25, includeAI: true, signal: controller.signal });
      // A late answer for a query that is no longer in the box is dropped,
      // aborted or not — it used to land after the box was cleared.
      if (!controller.signal.aborted && deepFor.current === term) {
        setDeepResults(Array.isArray(foods) ? foods : []);
      }
    } catch (err) {
      if (err?.name !== 'CanceledError' && err?.name !== 'AbortError' && deepFor.current === term) {
        setError(errorMessage(err, 'Couldn’t reach the food databases. Your own foods are still listed.'));
      }
    } finally {
      if (!controller.signal.aborted) setLoadingDeep(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(deepTimer.current);
    if (!wantDeep) {
      // Cleared, too short, or a sentence: the search still running is for
      // something that is no longer asked for.
      deepAbort.current?.abort();
      deepFor.current = '';
      setDeepResults([]);
      setLoadingDeep(false);
      setError(null);
      return undefined;
    }
    deepTimer.current = setTimeout(() => runDeepSearch(text), DEBOUNCE_DEEP_MS);
    return () => clearTimeout(deepTimer.current);
  }, [text, wantDeep, runDeepSearch]);

  useEffect(() => () => {
    localAbort.current?.abort();
    deepAbort.current?.abort();
    clearTimeout(deepTimer.current);
  }, []);

  // ── The one list, in a fixed order ───────────────────────────────────
  // Your own foods first (they arrived first and they are usually the answer),
  // then whatever the databases added, de-duplicated across both waves. The
  // order is remembered per query: a later batch only ever appends.
  const order = useRef({ query: null, keys: [] });
  const results = useMemo(() => {
    const byIdentity = new Map();
    for (const food of suggestions) byIdentity.set(identityOf(food), { ...food, tier: 'local' });
    for (const food of deepResults) {
      const key = identityOf(food);
      if (!byIdentity.has(key)) byIdentity.set(key, { ...food, tier: 'deep' });
    }
    const fresh = [...byIdentity.keys()];
    const known = order.current.query === text ? order.current.keys.filter((k) => byIdentity.has(k)) : [];
    const keys = [...known, ...fresh.filter((k) => !known.includes(k))];
    order.current = { query: text, keys };
    return keys.map((k) => byIdentity.get(k));
  }, [suggestions, deepResults, text]);

  const decomposedFrom = useMemo(
    () => deepResults.find((r) => r.decomposedFrom)?.decomposedFrom || null,
    [deepResults]
  );

  const plain = useMemo(() => results.filter((r) => !r.compositeItem), [results]);
  /** Results the backend split into parts, grouped under their fragment — after the plain rows. */
  const groups = useMemo(() => {
    const map = new Map();
    for (const food of results.filter((r) => r.compositeItem)) {
      if (!map.has(food.compositeItem)) map.set(food.compositeItem, []);
      map.get(food.compositeItem).push(food);
    }
    return [...map.entries()];
  }, [results]);

  // ── Rendering ────────────────────────────────────────────────────────
  const sectionHeading = (label) => (
    <Typography
      component="h3"
      sx={{ fontSize: '0.9375rem', fontWeight: 700, color: muted, mt: 2, mb: 0.5, px: 1.5, letterSpacing: '-0.01em' }}
    >
      {label}
    </Typography>
  );

  /**
   * A heading that opens and closes the list under it, with a count. Folded,
   * the count is the only thing telling you the list is there at all. A plain
   * number, not a Chip: a small filled chip is the suite's standing contrast
   * trap.
   */
  const collapsibleHeading = (label, count, open, onToggle, testId) => (
    <ButtonBase
      onClick={onToggle}
      aria-expanded={open}
      data-testid={testId}
      disabled={busy}
      sx={{
        width: '100%',
        justifyContent: 'flex-start',
        borderRadius: 2,
        // 44px is the suite's tap floor; the heading's own margins do not count.
        minHeight: 48,
        mt: 1,
        px: 1.5,
        gap: 1,
        opacity: busy ? 0.6 : 1,
        '@media (hover: hover)': { '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.04) } },
        '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
      }}
    >
      <ExpandIcon
        fontSize="small"
        aria-hidden
        sx={{ color: muted, transition: 'transform 150ms ease', transform: open ? 'none' : 'rotate(-90deg)' }}
      />
      <Typography component="span" sx={{ fontSize: '1rem', fontWeight: 700, color: ink }}>{label}</Typography>
      <Typography component="span" sx={{ color: muted, fontSize: '0.9375rem', fontVariantNumeric: 'tabular-nums' }}>
        ({count})
      </Typography>
    </ButtonBase>
  );

  const renderRow = (food) => {
    const key = identityOf(food);
    return (
      <FoodResultRow
        key={key}
        food={food}
        onTap={(f) => onPick?.(f, key)}
        onAdjust={onAdjust}
        onMore={onMore}
        added={added?.[key] || null}
        pending={busy && pendingKey === key}
        disabled={busy}
        ketoMode={ketoMode}
        dense={dense}
      />
    );
  };

  const rows = (
    <>
      {plain.map(renderRow)}
      {groups.map(([fragment, foods]) => (
        <Box key={fragment}>
          {sectionHeading(fragment)}
          {foods.map(renderRow)}
        </Box>
      ))}
    </>
  );

  const notes = (
    <>
      {decomposedFrom && (
        <Typography role="status" sx={{ color: muted, fontSize: '0.9375rem', px: 1.5, mt: 1 }}>
          No single match for <strong>{decomposedFrom}</strong>, so its parts are listed.
        </Typography>
      )}
      {error && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', px: 1.5, mt: 1 }}>
          <Typography role="status" sx={{ color: ink, fontSize: '0.9375rem' }}>
            {error}
          </Typography>
          {isSignedOutMessage(error) && <SignInButton />}
        </Box>
      )}
    </>
  );

  // The bar has a line of its own whether or not it is showing, so the rows
  // under it never jump when a search starts or ends.
  const progress = (
    <Box sx={{ height: 4, mb: 0.5 }}>
      {loadingDeep && (
        <LinearProgress sx={{ height: 2, borderRadius: 1, opacity: 0.7 }} aria-label="Searching food databases" />
      )}
    </Box>
  );

  const createRow = searching && !sentence && onCreateFood ? (
    <ButtonBase
      onClick={() => onCreateFood(text)}
      disabled={busy}
      sx={{
        width: '100%',
        justifyContent: 'flex-start',
        gap: 1.5,
        minHeight: 56,
        px: 1.5,
        mt: 1,
        borderRadius: 2,
        border: `1px dashed ${alpha(ink, 0.25)}`,
        '@media (hover: hover)': { '&:hover': { backgroundColor: theme.palette.action.hover } },
        '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
      }}
    >
      <CreateIcon sx={{ color: theme.palette.primary.main }} aria-hidden />
      <Typography component="span" sx={{ fontSize: '0.9375rem', color: ink, textAlign: 'left' }}>
        Can’t find it? Create <strong>&ldquo;{text}&rdquo;</strong>
      </Typography>
    </ButtonBase>
  ) : null;

  // ── A sentence: the list is something you ask for ────────────────────
  if (searching && sentence) {
    const count = results.length;
    if (count === 0 && !sentenceListOpen) return null;
    return (
      <Box data-testid="exact-food-list" data-folded={!sentenceListOpen}>
        {collapsibleHeading('Or pick an exact food', count, sentenceListOpen, () => setSentenceListOpen((v) => !v), 'exact-food-toggle')}
        <Collapse in={sentenceListOpen} unmountOnExit>
          {progress}
          {rows}
          {notes}
        </Collapse>
      </Box>
    );
  }

  // ── Nothing typed: your own foods, folded where they'd bury the page ──
  if (!searching) {
    if (plain.length === 0) return null;
    if (!collapseIdleList) {
      return (
        <Box data-testid="exact-food-list">
          {sectionHeading('Your foods')}
          {rows}
        </Box>
      );
    }
    return (
      <Box data-testid="exact-food-list" data-folded={!idleListOpen}>
        {collapsibleHeading('Your foods', plain.length, idleListOpen, () => setIdleListOpen((v) => !v), 'your-foods-toggle')}
        <Collapse in={idleListOpen} unmountOnExit>{rows}</Collapse>
      </Box>
    );
  }

  // ── A name ("fage"): the list, open ──────────────────────────────────
  const empty = results.length === 0;
  return (
    <Box data-testid="exact-food-list" data-folded="false">
      {progress}
      {rows}
      {empty && (
        loadingDeep ? (
          <Box>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 2, mb: 1 }} />
            ))}
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center', py: 3, px: 2 }} data-testid="no-match">
            <Typography sx={{ fontSize: '1.0625rem', fontWeight: 700, color: ink }}>
              No match in your foods yet
            </Typography>
            <Typography sx={{ color: muted, fontSize: '0.9375rem', mt: 0.5, maxWidth: 380, mx: 'auto' }}>
              {describeAvailable
                ? 'Tap Log it and I’ll work it out.'
                : onCreateFood ? 'You can create it below.' : 'Try another name.'}
            </Typography>
          </Box>
        )
      )}
      {notes}
      {createRow}
    </Box>
  );
};

export default UnifiedFoodSearch;
