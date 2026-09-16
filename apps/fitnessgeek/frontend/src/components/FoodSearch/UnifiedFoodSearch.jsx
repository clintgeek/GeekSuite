import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Box, Typography, Alert, Button, Skeleton, LinearProgress, Chip } from '@mui/material';
import { AddCircleOutline as CreateIcon, AutoAwesome as WandIcon } from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { useToast, readableOn } from '@geeksuite/ui';
import SearchBar from './SearchBar';
import FoodResultRow from './FoodResultRow';
import ServingSheet from './ServingSheet';
import SessionRibbon from './SessionRibbon';
import PortionQuestion from './PortionQuestion';
import { foodService } from '../../services/foodService';

/**
 * The food search box. One surface, two waves, no submit step.
 *
 * WHAT THIS REPLACES. The old version searched only when you pressed Enter or
 * a send arrow, then rendered a two-column grid of animated cards behind three
 * separately-collapsible browse accordions, and fed everything through a
 * classifier that split "chocolate chip pancakes" into chocolate, chip and
 * pancake. See DOCS/THE_FOOD_SEARCH_PLAN.md.
 *
 * HOW IT WORKS NOW.
 *
 *   Wave one (150ms after you stop typing) hits `/foods/suggest` — your own
 *   catalog, favourites, recents, custom foods. No network beyond our own
 *   Mongo, so it paints while you are still typing.
 *
 *   Wave two (400ms, or immediately on Enter) hits `/foods?search=` — the food
 *   APIs and, where it earns its place, the model. It APPENDS. Nothing already
 *   on screen moves out from under a finger.
 *
 * Tapping a row logs it at its default serving with an undo in the toast; the
 * trailing control opens the serving editor for the adds that need one. From
 * the second item onward a ribbon shows what this sitting has come to.
 *
 * DESCRIBE IS THE PRIMARY PATH (2026-09-16). Chef does not want to be the
 * search operator — he wants to say what he ate and have it written
 * (DOCS/THE_DESCRIBE_AND_LOG_PLAN.md §1). So the first thing under the box is
 * "Log …", and Enter fires it. Search still runs underneath on its own
 * debounce and is still the right answer for picking one specific branded
 * item, which is exactly the role the plan assigns it.
 *
 * Enter used to re-run the deep search. Nothing is lost: wave two already
 * fires 400ms after you stop typing, so Enter was only ever impatience.
 *
 * The box asked to describe a meal in its placeholder for a day before any of
 * this existed, and searched instead. Promising it and not doing it is worse
 * than not offering it.
 */

const DEBOUNCE_LOCAL_MS = 150;
const DEBOUNCE_DEEP_MS = 400;
const MIN_QUERY = 2;

/** Stable identity for de-duplicating the two waves against each other. */
const identityOf = (food) => {
  if (!food) return '';
  return (
    food.id ||
    food._id ||
    `${food.source || '?'}::${food.compositeItem || ''}::${(food.name || '').toLowerCase()}`
  );
};

const UnifiedFoodSearch = ({
  mode = 'page',
  mealType = 'snack',
  onMealTypeChange,
  onLogItems,          // (items, mealType) => Promise<{ok, fail, logIds}>
  onDescribe,          // (text) => Promise<{ok, fail, logIds, logged, skipped, questions}>
  onAdjustCalories,    // (logId, nutrition, servings, targetCalories) => Promise<boolean>
  onUndo,              // (logIds) => Promise<void>
  onCreateFood,        // (query) => void
  onBarcodeClick,
  initialQuery = '',
  ketoMode = false,
  autoFocus = false,
  className
}) => {
  const theme = useTheme();
  const { notify } = useToast();
  const muted = theme.palette.text.secondary;
  const ink = theme.palette.text.primary;

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [deepResults, setDeepResults] = useState([]);
  const [loadingDeep, setLoadingDeep] = useState(false);
  const [error, setError] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const [session, setSession] = useState([]);   // what this sitting has logged
  const [busy, setBusy] = useState(false);
  const [describing, setDescribing] = useState(false);
  // At most one, and only when the backend judged it worth asking (§3.8).
  const [question, setQuestion] = useState(null);

  const localAbort = useRef(null);
  const deepAbort = useRef(null);
  const deepTimer = useRef(null);
  const seededRef = useRef(null);

  // ── Wave one: the local catalog, on every pause ──────────────────────
  useEffect(() => {
    const handle = setTimeout(async () => {
      localAbort.current?.abort();
      const controller = new AbortController();
      localAbort.current = controller;
      try {
        const foods = await foodService.suggest(query, { limit: 15, signal: controller.signal });
        if (!controller.signal.aborted) setSuggestions(Array.isArray(foods) ? foods : []);
      } catch (err) {
        if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
          // A failed suggest is not a failed search — wave two may still answer.
          setSuggestions([]);
        }
      }
    }, DEBOUNCE_LOCAL_MS);

    return () => clearTimeout(handle);
  }, [query]);

  // ── Wave two: the food APIs, on a longer pause ───────────────────────
  const runDeepSearch = useCallback(async (term) => {
    const text = String(term || '').trim();
    if (text.length < MIN_QUERY) {
      setDeepResults([]);
      return;
    }

    deepAbort.current?.abort();
    const controller = new AbortController();
    deepAbort.current = controller;

    setLoadingDeep(true);
    setError(null);
    try {
      const foods = await foodService.search(text, { limit: 25, includeAI: true, signal: controller.signal });
      if (!controller.signal.aborted) setDeepResults(Array.isArray(foods) ? foods : []);
    } catch (err) {
      if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
        setError(err?.message || 'Could not reach the food databases. Your own foods are still listed.');
      }
    } finally {
      if (!controller.signal.aborted) setLoadingDeep(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(deepTimer.current);
    if (query.trim().length < MIN_QUERY) {
      setDeepResults([]);
      setLoadingDeep(false);
      return undefined;
    }
    deepTimer.current = setTimeout(() => runDeepSearch(query), DEBOUNCE_DEEP_MS);
    return () => clearTimeout(deepTimer.current);
  }, [query, runDeepSearch]);

  // A caller that already knows the query (a deep link, a barcode miss) seeds
  // it once — never overwriting what the person has since typed.
  useEffect(() => {
    const seed = String(initialQuery || '').trim();
    if (!seed || seededRef.current === seed) return;
    seededRef.current = seed;
    setQuery(seed);
  }, [initialQuery]);

  useEffect(() => () => {
    localAbort.current?.abort();
    deepAbort.current?.abort();
    clearTimeout(deepTimer.current);
  }, []);

  // ── The one list ─────────────────────────────────────────────────────
  // Your own foods first (they arrived first and they are usually the answer),
  // then whatever the databases added. De-duplicated across both waves.
  const results = useMemo(() => {
    const byIdentity = new Map();
    for (const food of suggestions) {
      byIdentity.set(identityOf(food), { ...food, tier: 'local' });
    }
    for (const food of deepResults) {
      const key = identityOf(food);
      if (!byIdentity.has(key)) byIdentity.set(key, { ...food, tier: 'deep' });
    }
    return [...byIdentity.values()];
  }, [suggestions, deepResults]);

  const decomposedFrom = useMemo(
    () => deepResults.find((r) => r.decomposedFrom)?.decomposedFrom || null,
    [deepResults]
  );

  /** Results the backend split into parts, grouped under their fragment. */
  const groups = useMemo(() => {
    const composite = results.filter((r) => r.compositeItem);
    if (composite.length === 0) return null;
    const map = new Map();
    for (const food of composite) {
      if (!map.has(food.compositeItem)) map.set(food.compositeItem, []);
      map.get(food.compositeItem).push(food);
    }
    return [...map.entries()];
  }, [results]);

  const plain = useMemo(() => results.filter((r) => !r.compositeItem), [results]);
  const searching = query.trim().length >= MIN_QUERY;

  // ── Logging ──────────────────────────────────────────────────────────
  const logFoods = useCallback(async (items, meal) => {
    if (!items?.length || !onLogItems) return;
    setBusy(true);
    try {
      const result = await onLogItems(items, meal || mealType);
      const ok = result?.ok ?? items.length;
      const logIds = result?.logIds || [];

      if (ok > 0) {
        // `perItem` groups the ids by the item that produced them. Pairing by
        // index was wrong the moment one item wrote more than one log: a saved
        // meal expands into several, and every later item took an id belonging
        // to the meal — so undoing a row deleted somebody else's food.
        const perItem = result?.perItem || items.map((_, i) => (logIds[i] ? [logIds[i]] : []));
        setSession((prev) => [
          ...prev,
          ...items.map((item, i) => ({ ...item, logIds: perItem[i] || [] }))
        ]);
        notify(`Logged ${items.length === 1 ? items[0].name : `${ok} items`}`, {
          tone: result?.fail ? 'warning' : 'success',
          action: logIds.length > 0 && onUndo ? (
            <Button
              size="small"
              sx={{ color: 'inherit', fontWeight: 700 }}
              onClick={async () => {
                await onUndo(logIds);
                setSession((prev) => prev.filter((entry) => !entry.logIds?.some((id) => logIds.includes(id))));
              }}
            >
              Undo
            </Button>
          ) : undefined
        });
      }
      if (result?.fail) {
        notify(`${result.fail} item${result.fail === 1 ? '' : 's'} could not be logged.`, { tone: 'error' });
      }
    } catch (err) {
      notify(err?.message || 'Could not log that. Try again.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }, [onLogItems, onUndo, mealType, notify]);

  /**
   * Send the sentence; the backend writes the log and tells us what landed.
   *
   * The query is cleared on success because it HAS been logged — leaving it in
   * the box is an invitation to log it twice, and this is the path that exists
   * so nobody has to think about it.
   */
  const describe = useCallback(async () => {
    const text = query.trim();
    if (!text || !onDescribe || describing) return;

    setDescribing(true);
    setError(null);
    try {
      const result = await onDescribe(text);
      const logged = result?.logged || [];
      const skipped = result?.skipped || [];
      const logIds = result?.logIds || [];

      if (logged.length > 0) {
        setQuery('');
        // `loggedServings` is the multiplier actually written, which is what
        // the ribbon multiplies `calories_per_serving` by. `servings` is what
        // was asked for, and the two differ whenever the estimate came back as
        // a whole-dish total.
        setSession((prev) => [
          ...prev,
          ...logged.map((entry) => ({
            name: entry.name,
            logIds: entry.logId ? [entry.logId] : [],
            servings: entry.loggedServings ?? entry.servings ?? 1,
            nutrition: entry.nutrition
          }))
        ]);

        // One question, and only when it moves the day. It is attached to the
        // entry it asks about so answering can re-scale that log's macros.
        const asked = (result?.questions || [])[0] || null;
        setQuestion(
          asked
            ? { ...asked, entry: logged.find((entry) => entry.logId === asked.logId) || null }
            : null
        );

        const summary = logged.length === 1
          ? `${logged[0].name} · ${Math.round(logged[0].calories || 0)} cal`
          : `${logged.length} items · ${Math.round(result?.totalCalories || 0)} cal`;

        notify(`Logged ${summary}`, {
          tone: skipped.length > 0 ? 'warning' : 'success',
          action: logIds.length > 0 && onUndo ? (
            <Button
              size="small"
              sx={{ color: 'inherit', fontWeight: 700 }}
              onClick={async () => {
                await onUndo(logIds);
                setSession((prev) => prev.filter((item) => !item.logIds?.some((id) => logIds.includes(id))));
              }}
            >
              Undo
            </Button>
          ) : undefined
        });
      }

      // A described line can partly fail: the sanity rails reject one entry
      // whose numbers are nonsense while its neighbours write fine. Saying so
      // beats a log that quietly disagrees with what he told it.
      if (skipped.length > 0) {
        setError(
          logged.length === 0
            ? `Couldn't make sense of that: ${skipped.map((s) => s.name).join(', ')}.`
            : `Logged the rest, but skipped ${skipped.map((s) => s.name).join(', ')} — the numbers looked wrong.`
        );
      }
    } catch (err) {
      // A 422 is a real answer ("no food in that"), not a fault; the server's
      // own words are the clearest thing to show.
      setError(
        err?.response?.data?.error?.message
        || err?.message
        || 'Could not log that. Try again.'
      );
    } finally {
      setDescribing(false);
    }
  }, [query, onDescribe, describing, onUndo, notify]);

  /** Answering re-scales the log that was already written. */
  const answerQuestion = useCallback(async (asked, targetCalories) => {
    if (!onAdjustCalories || !asked?.entry) { setQuestion(null); return; }
    setBusy(true);
    try {
      await onAdjustCalories(
        asked.logId,
        asked.entry.nutrition,
        asked.entry.loggedServings ?? asked.entry.servings ?? 1,
        targetCalories
      );
      setSession((prev) => prev.map((item) => (
        item.logIds?.includes(asked.logId)
          ? {
            ...item,
            nutrition: {
              ...item.nutrition,
              calories_per_serving: targetCalories / (item.servings || 1)
            }
          }
          : item
      )));
      notify(`Updated to ${Math.round(targetCalories)} cal`, { tone: 'success' });
    } catch (err) {
      notify(err?.message || 'Could not update that.', { tone: 'error' });
    } finally {
      setQuestion(null);
      setBusy(false);
    }
  }, [onAdjustCalories, notify]);

  const handleTap = useCallback((food) => {
    const servings = Number(food.requestedQuantity) > 0 ? Number(food.requestedQuantity) : 1;
    logFoods([{ ...food, servings }], mealType);
  }, [logFoods, mealType]);

  const undoAll = useCallback(async () => {
    const ids = session.flatMap((entry) => entry.logIds || []);
    if (ids.length === 0 || !onUndo) return;
    setBusy(true);
    try {
      await onUndo(ids);
      setSession([]);
      notify('Undone.', { tone: 'info' });
    } finally {
      setBusy(false);
    }
  }, [session, onUndo, notify]);

  const undoLast = useCallback(async () => {
    const last = session[session.length - 1];
    if (!last?.logIds?.length || !onUndo) return;
    setBusy(true);
    try {
      // A meal's several logs go together: it was one gesture, so it is one undo.
      await onUndo(last.logIds);
      setSession((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }, [session, onUndo]);

  // ── Rendering ────────────────────────────────────────────────────────
  const sectionHeading = (text) => (
    <Typography
      component="h3"
      sx={{
        fontFamily: "'DM Serif Display', serif",
        fontSize: '0.9375rem',
        color: muted,
        mt: 2,
        mb: 0.5,
        px: 1.5,
        letterSpacing: '-0.01em'
      }}
    >
      {text}
    </Typography>
  );

  const renderRow = (food) => (
    <FoodResultRow
      key={identityOf(food)}
      food={food}
      onTap={handleTap}
      onAdjust={setAdjusting}
      ketoMode={ketoMode}
      dense={mode === 'dialog'}
    />
  );

  const describeRow = searching && onDescribe ? (
    <Box
      role="button"
      tabIndex={0}
      aria-busy={describing}
      onClick={describe}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); describe(); } }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        minHeight: 56,
        px: 1.5,
        py: 1,
        mb: 1,
        borderRadius: 2,
        cursor: describing ? 'progress' : 'pointer',
        opacity: describing ? 0.7 : 1,
        pointerEvents: describing ? 'none' : 'auto',
        border: `1px solid ${alpha(theme.palette.primary.main, 0.4)}`,
        backgroundColor: alpha(theme.palette.primary.main, 0.06),
        '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.12) },
        '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 }
      }}
    >
      <WandIcon sx={{ color: theme.palette.primary.main }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.9375rem', color: ink, fontWeight: 600 }}>
          {describing ? 'Logging…' : <>Log &ldquo;{query.trim()}&rdquo;</>}
        </Typography>
        {/*
          * `muted` at 12px measured 4.42:1 on this tinted panel — just under
          * the 4.5 AA floor for normal text, which 12px is. `readableOn` walks
          * it until it clears, and needs `under` because the panel is an
          * alpha() tint: a translucent surface is a colour AND the paper below
          * it, and measuring against the tint alone gets a different answer.
          */}
        <Typography
          sx={{
            fontSize: '0.75rem',
            color: readableOn(muted, alpha(theme.palette.primary.main, 0.06), {
              under: theme.palette.background.paper
            })
          }}
        >
          {describing
            ? 'Working out what that comes to'
            : 'Writes it straight to your log — undo is one tap'}
        </Typography>
      </Box>
    </Box>
  ) : null;

  const createRow = searching && onCreateFood ? (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => onCreateFood(query.trim())}
      onKeyDown={(e) => { if (e.key === 'Enter') onCreateFood(query.trim()); }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        minHeight: 56,
        px: 1.5,
        mt: 1,
        borderRadius: 2,
        cursor: 'pointer',
        border: `1px dashed ${alpha(ink, 0.25)}`,
        '&:hover': { backgroundColor: theme.palette.action.hover },
        '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 }
      }}
    >
      <CreateIcon sx={{ color: theme.palette.primary.main }} />
      <Typography sx={{ fontSize: '0.875rem', color: ink }}>
        Can&apos;t find it? Create <strong>&ldquo;{query.trim()}&rdquo;</strong>
      </Typography>
    </Box>
  ) : null;

  return (
    <Box className={className} sx={{ pb: session.length >= 2 ? 1 : 0 }}>
      <SearchBar
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onSubmit={() => (onDescribe ? describe() : runDeepSearch(query))}
        onBarcodeClick={onBarcodeClick}
        loading={loadingDeep}
        autoFocus={autoFocus || mode === 'dialog'}
        placeholder={onDescribe ? 'What did you eat?' : 'Search foods'}
      />

      {onMealTypeChange && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
          {['breakfast', 'lunch', 'dinner', 'snack'].map((meal) => (
            <Chip
              key={meal}
              label={meal.charAt(0).toUpperCase() + meal.slice(1)}
              onClick={() => onMealTypeChange(meal)}
              aria-pressed={meal === mealType}
              color={meal === mealType ? 'primary' : 'default'}
              variant={meal === mealType ? 'filled' : 'outlined'}
              sx={{ height: 44, borderRadius: 999, fontWeight: 600, '& .MuiChip-label': { px: 1.75 } }}
            />
          ))}
        </Box>
      )}

      {/*
        * The primary action, above the results, because describing is the
        * point and searching is the fallback. It says exactly what it will
        * write, so "no confirm step" does not become "no idea what happened".
        */}
      {describeRow}

      {/*
        * Asked only after the food is already in the log, and only when the
        * spread is wide enough to matter. Ignoring it costs nothing.
        */}
      <PortionQuestion
        question={question}
        busy={busy}
        onAnswer={answerQuestion}
        onDismiss={() => setQuestion(null)}
      />

      {/* Wave two in flight, under results that are already usable */}
      {loadingDeep && (
        <LinearProgress
          sx={{ height: 2, borderRadius: 1, mb: 1, opacity: 0.7 }}
          aria-label="Searching food databases"
        />
      )}

      {decomposedFrom && (
        <Alert
          severity="info"
          icon={<WandIcon />}
          sx={{ mb: 1.5, borderRadius: 2, fontSize: '0.8125rem' }}
        >
          No single match for <strong>{decomposedFrom}</strong> — showing its parts instead.
        </Alert>
      )}

      {error && (
        <Alert severity="warning" onClose={() => setError(null)} sx={{ mb: 1.5, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* Results */}
      {groups ? (
        groups.map(([fragment, foods]) => (
          <Box key={fragment}>
            {sectionHeading(fragment)}
            {foods.map(renderRow)}
          </Box>
        ))
      ) : (
        <>
          {!searching && plain.length > 0 && sectionHeading('Your foods')}
          {plain.map(renderRow)}
        </>
      )}

      {/* Nothing yet */}
      {plain.length === 0 && !groups && (
        loadingDeep ? (
          <Box sx={{ mt: 1 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 2, mb: 1 }} />
            ))}
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center', py: 5, px: 3 }}>
            <Typography sx={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.25rem', color: ink }}>
              {searching ? 'Nothing found' : 'What did you eat?'}
            </Typography>
            <Typography sx={{ color: muted, fontSize: '0.875rem', mt: 0.5, maxWidth: 380, mx: 'auto' }}>
              {searching
                ? 'Try fewer words, or create it below.'
                : 'Start typing — your own foods come up first. A sentence like “2 eggs and toast” works too.'}
            </Typography>
          </Box>
        )
      )}

      {createRow}

      <SessionRibbon
        items={session}
        onUndoAll={undoAll}
        onUndoLast={undoLast}
        busy={busy}
      />

      <ServingSheet
        open={Boolean(adjusting)}
        food={adjusting}
        defaultMealType={mealType}
        onClose={() => setAdjusting(null)}
        onConfirm={(food, meal) => {
          setAdjusting(null);
          logFoods([food], meal);
        }}
      />
    </Box>
  );
};

export default UnifiedFoodSearch;
