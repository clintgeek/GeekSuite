import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Alert, Box, Button, Chip, Typography } from '@mui/material';
import { QrCodeScanner as BarcodeIcon, CheckCircle as AddedIcon, Undo as UndoIcon } from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { useToast } from '@geeksuite/ui';
import ComposerBox from './ComposerBox.jsx';
import UnifiedFoodSearch from './UnifiedFoodSearch.jsx';
import ServingSheet from './ServingSheet';
import SessionRibbon from './SessionRibbon';
import PortionQuestion from './PortionQuestion';
import QuickPicks from './QuickPicks';
import EntryList from './EntryList.jsx';
import FixSheet from './FixSheet.jsx';
import { useEntryFixes } from './useEntryFixes.js';
import { identityOf, applyItemChange, entryFromLogged, withAmount } from './entries.js';
import SignInButton, { isSignedOutMessage } from './SignInButton.jsx';
import { readDraft, writeDraft, draftsAvailable } from './composerDraft.js';
import { useSpeechInput } from '../../hooks/useSpeechInput.js';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';
import { useToday } from '../../hooks/useToday.js';
import { useExperience } from '../../contexts/ExperienceContext.jsx';
import { addedMessage, mealWord } from '../../utils/plainWords.js';
import { errorMessage } from '../../utils/errorMessage.js';
import { useUndoToast, runUndo } from './undoToast.jsx';
import { newIdempotencyKey } from './idempotency.js';
import {
  isSentence,
  detectDayWords,
  resolveDayHint,
  sheetDayWords,
  sheetMealOnDay,
  describeFailure,
  NOTHING_TO_LOG_MESSAGE,
  OFFLINE_COMPOSER_MESSAGE,
  OFFLINE_UNSAVED_MESSAGE,
  STILL_WORKING_MESSAGE,
} from './composerText.js';

/**
 * The food composer: "just tell it what you ate" (REVIEW_2026-10 §4,
 * Phase 3.16). One surface; the sentence is the default and the list is
 * something you ask for.
 *
 * WHY. Heather typed a sentence and the screen showed a list of near-misses
 * and, when nothing matched, "Nothing found — Try fewer words, or create it
 * below": it told her to shorten a sentence the app would have handled. The
 * real action, "Log '…'", was styled like the first search result. The AI
 * path worked; the screen hid it.
 *
 * THE STATES, in order:
 *
 *   empty     the box, Log it (dim) and the mic; "Or tap one you've had"
 *             (Same as yesterday's lunch, the Again chips); your own foods,
 *             folded; "Scan a barcode" as a text link.
 *   typing    a sentence (composerText.isSentence) folds the list into
 *             "Or pick an exact food (n)" and runs no deep search; a name
 *             ("fage") shows the list open, each row with "+ Add".
 *   day       the words name a day ("last night") that isn't the one on
 *             screen: "Log this to yesterday? [Yes] [No, today]", before
 *             anything is written (Phase 3.17).
 *   thinking  the box is read-only, Log it says "Working it out…" with a
 *             spinner, and every other way to write is off. After 8 s:
 *             "Still working — this one's taking a moment."
 *   result    Simple stays open on what landed: "✓ Added to lunch", each
 *             entry with its calories and Fix, Undo all and Done. Full closes
 *             (Chef: "the one-tap … should close to show it completed") and
 *             hands the entries to `onJustAdded`, which puts a "Just added"
 *             strip on that meal's card. Anything left to look at — a skip, a
 *             portion question, a day the server heard that we didn't ask
 *             about — keeps the result open in Full too.
 *   error     plain words, with her text still in the box: no signal (Log it
 *             is off until it's back), "That didn't go through. Tap Log it to
 *             try again." (the same Idempotency-Key on that retry, C2), "I
 *             couldn't find a food in that…", and "Logged the soup. I couldn't
 *             work out 'crackers'. [Pick crackers]".
 *
 * Tapping a list row is a picking session, as before: it logs in place and
 * nothing closes. The ribbon shows from the first item, with Done (L10). Its
 * pill becomes "Make it 2" (FoodResultRow).
 *
 * A SECOND TAP IS ANOTHER SERVING (L2). Heather taps "Egg" twice for two
 * eggs (§2a). The second tap on the same row — or the same Again chip — in
 * one sitting adds a serving to the entry already written instead of writing
 * a second one: one entry, two servings, and its Undo takes back the whole
 * entry. `addedByKey` remembers what each row or chip wrote, for this meal
 * and day only.
 *
 * THE WORDS OUTLIVE THE SHEET (L18). The add sheet unmounts on close, and
 * "Your words are saved here" was only true while it stayed open. In the
 * sheet the draft is kept per day and meal in sessionStorage
 * (composerDraft.js), restored on reopen and cleared once something logs.
 *
 * ONE WRITE AT A TIME (REVIEW_2026-10 B7). A tapped row shows "Adding…" at
 * once, and while any write from this box is in flight — a row, a chip, a
 * serving sheet, a describe, an undo, a fix — every other way to write is
 * disabled. The guard is a ref as well as state, because two taps can land
 * before the first re-render does.
 */

const SLOW_MS = 8000;

/** "Chicken soup", "Burger and Fries", "3 items": what was described, not how many rows it became. */
function whatWasLogged(logged) {
  // A saved meal writes one row per component, so "homemade quesadilla" is
  // seven rows — and "Logged 7 items" for one quesadilla reads like something
  // went wrong. Rows from the same saved meal count as the one thing said.
  const units = [];
  const seenMeals = new Set();
  for (const row of logged) {
    const mealId = row?.savedMeal?.id;
    if (mealId) {
      if (seenMeals.has(mealId)) continue;
      seenMeals.add(mealId);
      units.push(row.savedMeal.name);
    } else {
      units.push(row.name);
    }
  }
  if (units.length === 1) return units[0];
  if (units.length === 2) return `${units[0]} and ${units[1]}`;
  return `${units.length} items`;
}

const quoted = (names) => names.map((n) => `'${n}'`).join(' or ');

const FoodComposer = ({
  mode = 'page',
  mealType = 'snack',
  onMealTypeChange,
  onLogItems,          // (items, mealType) => Promise<{ok, fail, logIds, perItem}>
  onDescribe,          // (text, {mealType, idempotencyKey, date}) => Promise<{logged, skipped, logIds, questions, dayHint}>
  onAdjustCalories,    // (logId, nutrition, servings, targetCalories) => Promise<boolean>
  onSetCalories,       // (logId, nutrition, servings, targetCalories) => Promise<nutrition|false> (C3)
  onUpdateLog,         // (logId, patch) => Promise<boolean>
  onUndo,              // (logIds) => Promise<{deleted, failed}>
  onCreateFood,        // (query) => void
  onClose,             // ({ mealType }) => void — a finished describe calls this
  onJustAdded,         // (entry | null) => void — Full: the "Just added" strip
  onBarcodeClick,
  initialQuery = '',
  ketoMode = false,
  autoFocus = false,
  // Fold the idle list ("Your foods") behind its heading until asked for.
  collapseIdleList = false,
  // "Again" chips and "Same as yesterday's …" in the empty state.
  showQuickPicks = false,
  // The day being logged to (YYYY-MM-DD); today when not given.
  date = null,
  // 'card' (stay open on the result) or 'close'. Default: Simple → card.
  resultStyle,
  voice = true,
  className
}) => {
  const theme = useTheme();
  const { notify } = useToast();
  const { offerUndo, sayUndoOutcome } = useUndoToast(onUndo);
  const { isSimple } = useExperience();
  const { isOnline } = useOnlineStatus();
  const today = useToday();
  const day = date || today;
  const afterDescribe = resultStyle || (isSimple ? 'card' : 'close');

  // The sheet's draft: what she typed last time for this day and meal (L18).
  const keepDraft = mode === 'dialog';
  const [query, setQuery] = useState(() => (keepDraft && !String(initialQuery || '').trim() ? readDraft(day, mealType) : ''));
  const [session, setSession] = useState([]);   // what this sitting has logged
  const [busy, setBusy] = useState(false);
  // Which row or chip the write in flight came from, so it can say "Adding…".
  const [pendingKey, setPendingKey] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [slow, setSlow] = useState(false);
  const [dayAsk, setDayAsk] = useState(null);
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);
  // At most one, and only when the backend judged it worth asking (§3.8).
  const [question, setQuestion] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const [fixing, setFixing] = useState(null);
  // What each row or chip has written this sitting, by its key:
  // `{ logIds, servings, name, mealType, date }`. A second tap on the same
  // key adds a serving to that entry (L2); the row and the chip count it.
  const [addedByKey, setAddedByKey] = useState({});
  const addedRef = useRef(addedByKey);
  addedRef.current = addedByKey;

  const inputRef = useRef(null);
  const seededRef = useRef(null);
  const inFlight = useRef(false);
  // The describe press being retried keeps its Idempotency-Key (C2).
  const describeAttempt = useRef(null);

  const sentence = isSentence(query);
  const typed = query.trim();

  // Keep the draft as she types; an empty box keeps nothing. The key moves
  // with the meal chips, and the old key's draft goes with it.
  const draftKeyRef = useRef(null);
  useEffect(() => {
    if (!keepDraft) return;
    const key = `${day}|${mealType}`;
    if (draftKeyRef.current && draftKeyRef.current !== key) {
      const [oldDay, oldMeal] = draftKeyRef.current.split('|');
      writeDraft(oldDay, oldMeal, '');
    }
    draftKeyRef.current = key;
    writeDraft(day, mealType, query);
  }, [keepDraft, day, mealType, query]);
  const forgetDraft = useCallback(() => {
    if (keepDraft) writeDraft(day, mealType, '');
  }, [keepDraft, day, mealType]);

  /** An error toast; "Please sign in again." comes with a Sign in button (L24). */
  const sayError = useCallback((err, fallback) => {
    const text = errorMessage(err, fallback);
    notify(text, {
      tone: 'error',
      ...(isSignedOutMessage(text) ? { action: <SignInButton variant="text" sx={{ color: 'inherit' }} /> } : {}),
    });
  }, [notify]);

  /** Take the box's one write slot, or say no if a write is already running. */
  const beginWrite = useCallback((key = null) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setPendingKey(key);
    return true;
  }, []);
  const endWrite = useCallback(() => {
    inFlight.current = false;
    setBusy(false);
    setPendingKey(null);
  }, []);

  // A caller that already knows the query (a deep link, a barcode miss) seeds
  // it once — never overwriting what the person has since typed.
  useEffect(() => {
    const seed = String(initialQuery || '').trim();
    if (!seed || seededRef.current === seed) return;
    seededRef.current = seed;
    setQuery(seed);
  }, [initialQuery]);

  // "Still working" after eight seconds of thinking.
  useEffect(() => {
    if (!thinking) { setSlow(false); return undefined; }
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, [thinking]);

  const changeQuery = useCallback((value) => {
    setQuery(value);
    setDayAsk(null);
    // Editing the words answers the error; the message has done its job.
    setFailure((f) => (f?.kind === 'offline' ? f : null));
  }, []);

  // ── Logging list rows and chips ──────────────────────────────────────
  /** The ribbon forgets only what was really deleted. */
  const forgetDeleted = useCallback((deleted) => {
    if (!deleted?.length) return;
    setSession((prev) => prev
      .map((entry) => {
        const ids = entry.logIds || [];
        if (!ids.some((id) => deleted.includes(id))) return entry;
        return { ...entry, logIds: ids.filter((id) => !deleted.includes(id)) };
      })
      .filter((entry) => (entry.logIds || []).length > 0));
    setAddedByKey((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([, a]) => !a.logIds.some((id) => deleted.includes(id))));
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, []);

  const logFoods = useCallback(async (items, meal, key = null) => {
    if (!items?.length || !onLogItems) return null;
    if (!beginWrite(key)) return null;
    // Another add is the next action: the "Just added" strip has done its job.
    onJustAdded?.(null);
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
          ...items.map((item, i) => ({ ...item, logIds: perItem[i] || [], mealType: meal || mealType, date: day }))
        ]);
        // "Egg ×2", not "Egg", when it wasn't one (L4).
        const what = items.length === 1 ? withAmount(items[0].name, items[0].type === 'household-meal' ? 1 : items[0].servings) : `${ok} items`;
        offerUndo(addedMessage(meal || mealType, what), logIds, {
          tone: result?.fail ? 'warning' : 'success',
          onDeleted: forgetDeleted
        });
        forgetDraft();
      }
      if (result?.fail) {
        const fallback = items.length === 1
          ? "Couldn't add that. Try again."
          : `${result.fail} item${result.fail === 1 ? '' : 's'} could not be logged.`;
        sayError(result?.errors?.[0], fallback);
      }
      return result;
    } catch (err) {
      sayError(err, 'Could not log that. Try again.');
      return null;
    } finally {
      endWrite();
    }
  }, [onLogItems, onJustAdded, mealType, day, offerUndo, forgetDeleted, forgetDraft, sayError, beginWrite, endWrite]);

  /** What this key wrote earlier in this sitting, if it can take another serving. */
  const priorFor = useCallback((key) => {
    const prior = key ? addedRef.current[key] : null;
    if (!prior || prior.logIds.length !== 1 || prior.mealType !== mealType || prior.date !== day) return null;
    return prior;
  }, [mealType, day]);

  /**
   * One entry, `count` servings: "Make it 2", and a second tap on the same
   * row or chip (L2). `asTap` is the second tap, which says what is now in
   * the log and offers the Undo that takes back the whole entry.
   */
  const setServings = useCallback(async (key, count, { asTap = false } = {}) => {
    const prior = priorFor(key);
    if (!prior || !onUpdateLog) return;
    if (!beginWrite(key)) return;
    const logId = prior.logIds[0];
    try {
      const ok = await onUpdateLog(logId, { servings: count });
      if (!ok) throw new Error('not updated');
      setAddedByKey((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], servings: count } } : prev));
      setSession((prev) => prev.map((item) => (
        item.logIds?.includes(logId) ? { ...item, servings: count } : item
      )));
      if (asTap) {
        offerUndo(addedMessage(prior.mealType, withAmount(prior.name, count)), [logId], { onDeleted: forgetDeleted });
      } else {
        notify(`Changed to ${count} ✓ · ${prior.name}`, { tone: 'success' });
      }
    } catch (err) {
      sayError(err, "Couldn't change that. Try again.");
    } finally {
      endWrite();
    }
  }, [priorFor, onUpdateLog, notify, offerUndo, forgetDeleted, sayError, beginWrite, endWrite]);

  /**
   * A row or a chip: the first tap writes an entry; the next tap on the same
   * one, in this sitting, makes it one more serving (L2).
   */
  const pickOne = useCallback(async (item, key) => {
    const single = item && item.type !== 'meal' && item.kind !== 'meal' && item.type !== 'household-meal';
    const prior = single && onUpdateLog ? priorFor(key) : null;
    if (prior) {
      await setServings(key, Math.round((Number(prior.servings) || 1) + 1), { asTap: true });
      return;
    }
    const written = await logFoods([item], mealType, key);
    const ids = written?.perItem?.[0] || written?.logIds || [];
    if (single && key && (written?.ok ?? 0) > 0 && ids.length === 1) {
      setAddedByKey((prev) => ({
        ...prev,
        [key]: { logIds: ids, servings: Number(item.servings) || 1, name: item.name, mealType, date: day },
      }));
    }
  }, [onUpdateLog, priorFor, setServings, logFoods, mealType, day]);

  const handlePick = useCallback((food, key) => {
    const servings = Number(food.requestedQuantity) > 0 ? Number(food.requestedQuantity) : 1;
    return pickOne({ ...food, servings }, key);
  }, [pickOne]);

  /** The quick picks: one food is a pick like a row; several go as one gesture. */
  const handleQuick = useCallback((items, key) => (
    items?.length === 1 ? pickOne(items[0], key) : logFoods(items, mealType, key)
  ), [pickOne, logFoods, mealType]);

  /** The row's or chip's "Make it N". */
  const handleMore = useCallback((key, count) => setServings(key, count), [setServings]);
  const rowMore = useCallback((food, count) => handleMore(identityOf(food), count), [handleMore]);

  // ── Describe-and-log ─────────────────────────────────────────────────
  /**
   * Send the sentence; the backend writes the log and tells us what landed.
   * `onDay` is the day it goes to: the one on screen, or the one she
   * confirmed when the words named another.
   */
  const runDescribe = useCallback(async (text, onDay, { spoken = null, askedDay = false } = {}) => {
    if (!text || !onDescribe) return;
    if (!beginWrite('describe')) return;
    onJustAdded?.(null);
    setDayAsk(null);
    setFailure(null);
    setQuestion(null);
    setResult(null);

    // Pressing Log it again on the same words after a failure is a retry of
    // that press, and keeps its key — the first try may have written on the
    // server after this end gave up on it (C2). New words, new press.
    if (describeAttempt.current?.text !== text || describeAttempt.current?.day !== onDay) {
      describeAttempt.current = { text, day: onDay, key: newIdempotencyKey() };
    }
    const idempotencyKey = describeAttempt.current.key;

    setThinking(true);
    try {
      // The meal the person picked (a meal card's "+ Add", or the chips)
      // rides along, so "two eggs" from Lunch's sheet lands in lunch.
      const response = await onDescribe(text, { mealType, idempotencyKey, date: onDay });
      // It answered: whatever comes next is a new press.
      describeAttempt.current = null;
      const logged = response?.logged || [];
      const skipped = response?.skipped || [];
      const logIds = response?.logIds || [];

      if (logged.length === 0) {
        // The rails threw out everything, or there was nothing to read.
        const names = skipped.map((s) => s.name).filter(Boolean);
        setFailure(names.length
          ? { kind: 'nothing', message: `I couldn't work out ${quoted(names)}. Try naming the food, like 'chicken soup'.`, picks: names }
          : { kind: 'nothing', message: NOTHING_TO_LOG_MESSAGE });
        return;
      }

      // It has been logged — leaving it in the box is an invitation to log
      // it twice, and this path exists so nobody has to think about it.
      setQuery('');
      forgetDraft();
      // `loggedServings` is the multiplier actually written, which is what
      // the ribbon multiplies `calories_per_serving` by.
      setSession((prev) => [
        ...prev,
        ...logged.map((entry) => ({
          name: entry.name,
          logIds: entry.logId ? [entry.logId] : [],
          servings: entry.loggedServings ?? entry.servings ?? 1,
          nutrition: entry.nutrition,
          mealType: entry.mealType || mealType,
          date: onDay,
        }))
      ]);

      // One question, and only when it moves the day. It is attached to the
      // entry it asks about so answering can re-scale that log's macros.
      const questions = response?.questions || [];
      const asked = questions[0] || null;
      setQuestion(asked ? { ...asked, entry: logged.find((entry) => entry.logId === asked.logId) || null } : null);

      const landed = logged[0]?.mealType || mealType;
      const items = logged.map((row) => entryFromLogged(row, { mealType: landed, date: onDay, questions }));

      // The server heard a day we didn't ask about ("on monday" the client
      // pattern missed). It logged where it was told; offer the move.
      const serverDay = response?.dayHint ? resolveDayHint(response.dayHint, today) : null;
      const dayMove = !askedDay && serverDay && serverDay !== onDay
        ? { target: serverDay, words: (response?.dayWords || [])[0] || null }
        : null;

      const clean = skipped.length === 0 && !asked && !dayMove;
      if (afterDescribe === 'close' && clean) {
        // With a "Just added" strip there is no toast (L12): the strip says
        // what landed and has the Undo, and the snackbar sat on top of it,
        // covering its Undo and Done for ten seconds. Without one, the toast
        // is the only confirmation, so it keeps its Undo.
        if (onJustAdded) {
          onJustAdded({ mealType: landed, date: onDay, items, heard: spoken });
        } else {
          offerUndo(addedMessage(landed, `${whatWasLogged(logged)} · ${Math.round((logged.length === 1 ? logged[0].calories : response?.totalCalories) || 0)} cal`), logIds, {
            tone: 'success',
            onDeleted: forgetDeleted
          });
        }
        // Which meal it landed in, so a caller with no sheet to close — the
        // composer built into the Food Log page — can bring it into view.
        onClose?.({ mealType: landed });
        return;
      }

      setResult({
        mealType: landed,
        date: onDay,
        items,
        heard: spoken,
        text,
        skipped: skipped.map((s) => s.name).filter(Boolean),
        what: whatWasLogged(logged),
        dayMove,
      });
    } catch (err) {
      // A 422 is a real answer ("no food in that"), not a fault. Everything
      // else keeps the words and says to tap again.
      setFailure(describeFailure(err));
    } finally {
      setThinking(false);
      endWrite();
    }
  }, [onDescribe, onJustAdded, onClose, mealType, today, afterDescribe, offerUndo, forgetDeleted, forgetDraft, beginWrite, endWrite]);

  /** Log it: ask about the day first when the words name another one. */
  const pressLogIt = useCallback((spoken) => {
    // `spoken` is the microphone's transcript, handed straight in: the box's
    // `query` state has not caught up with it yet on this render.
    const text = String(typeof spoken === 'string' ? spoken : query).trim();
    if (!text || !onDescribe || inFlight.current) return;
    if (!isOnline) { setFailure({ kind: 'offline', message: OFFLINE_COMPOSER_MESSAGE }); return; }
    const said = detectDayWords(text);
    const target = said ? resolveDayHint(said.hint, today, { last: said.last }) : null;
    if (target && target !== day) {
      setFailure(null);
      setDayAsk({ text, target, words: said.words, spoken: typeof spoken === 'string' ? spoken : null });
      return;
    }
    runDescribe(text, day, { spoken: typeof spoken === 'string' ? spoken : null });
  }, [query, onDescribe, isOnline, today, day, runDescribe]);

  // ── Speak it ─────────────────────────────────────────────────────────
  // The transcript goes into the box (so she can see what was heard) and
  // straight through describe-and-log, the same path typing takes.
  const pressRef = useRef(pressLogIt);
  pressRef.current = pressLogIt;
  const speech = useSpeechInput({
    onFinal: (text) => {
      setQuery(text);
      pressRef.current(text);
    }
  });
  const micAvailable = voice && speech.supported && Boolean(onDescribe);
  // Offline the speech service can't work, and its error said the microphone
  // was broken (L18). The mic stays visible, turned off, under "No signal".
  const micOff = !isOnline;
  const toggleMic = useCallback(() => {
    if (speech.listening) speech.stop();
    else speech.start();
  }, [speech]);

  // ── After a result ───────────────────────────────────────────────────
  /** Answering re-scales the log that was already written. */
  const answerQuestion = useCallback(async (asked, targetCalories) => {
    if (!onAdjustCalories || !asked?.entry) { setQuestion(null); return; }
    if (!beginWrite('portion')) return;
    try {
      const updated = await onAdjustCalories(
        asked.logId,
        asked.entry.nutrition,
        asked.entry.loggedServings ?? asked.entry.servings ?? 1,
        targetCalories
      );
      // `false` means nothing was written; saying "Updated" then was a lie.
      if (!updated) {
        sayError(null, 'Could not update that.');
        return;
      }
      setSession((prev) => prev.map((item) => (
        item.logIds?.includes(asked.logId)
          ? { ...item, nutrition: { ...item.nutrition, calories_per_serving: targetCalories / (item.servings || 1) } }
          : item
      )));
      setResult((prev) => (prev ? {
        ...prev,
        items: prev.items.map((i) => (i.logId === asked.logId ? { ...i, calories: Math.round(targetCalories) } : i)),
      } : prev));
      notify(`Updated to ${Math.round(targetCalories)} cal`, { tone: 'success' });
    } catch (err) {
      sayError(err, 'Could not update that.');
    } finally {
      setQuestion(null);
      endWrite();
    }
  }, [onAdjustCalories, notify, sayError, beginWrite, endWrite]);

  /** The ribbon's undos: same outcome toast, and only deleted rows leave. */
  const undoIds = useCallback(async (ids) => {
    if (!ids?.length || !onUndo) return { deleted: [], failed: [] };
    if (!beginWrite('undo')) return { deleted: [], failed: ids };
    try {
      const outcome = await runUndo(onUndo, ids);
      forgetDeleted(outcome.deleted);
      sayUndoOutcome(outcome.failed, undoIds);
      return outcome;
    } finally {
      endWrite();
    }
  }, [onUndo, forgetDeleted, sayUndoOutcome, beginWrite, endWrite]);

  // A meal's several logs go together: it was one gesture, so it is one undo.
  const undoLast = useCallback(
    () => undoIds(session[session.length - 1]?.logIds || []),
    [session, undoIds]
  );

  /** The result card's Undo all: the entries go, and her words come back. */
  const undoResult = useCallback(async () => {
    if (!result) return;
    const ids = result.items.map((i) => i.logId).filter(Boolean);
    const { deleted } = await undoIds(ids);
    const left = result.items.filter((i) => !deleted.includes(i.logId));
    if (left.length === 0) {
      setResult(null);
      setQuestion(null);
      setQuery(result.text || '');
    } else {
      setResult({ ...result, items: left });
    }
  }, [result, undoIds]);

  /** The ribbon's Done (L10): the sitting is over, and the sheet closes. */
  const finishSession = useCallback(() => {
    const meal = session[session.length - 1]?.mealType ?? mealType;
    setSession([]);
    setAddedByKey({});
    onClose?.({ mealType: meal });
  }, [session, mealType, onClose]);

  const finishResult = useCallback(() => {
    const meal = result?.mealType ?? mealType;
    setResult(null);
    setQuestion(null);
    setFixing(null);
    onClose?.({ mealType: meal });
  }, [result, mealType, onClose]);

  /** "Pick crackers": back to the box, the list open on that one word. */
  const pickFragment = useCallback((name) => {
    setResult(null);
    setFailure(null);
    setQuestion(null);
    setQuery(String(name || '').toLowerCase());
    requestAnimationFrame(() => inputRef.current?.focus?.());
  }, []);

  const moveResultDay = useCallback(async () => {
    if (!result?.dayMove || !onUpdateLog) return;
    if (!beginWrite('move')) return;
    const target = result.dayMove.target;
    try {
      const settled = await Promise.allSettled(result.items.map((i) => onUpdateLog(i.logId, { log_date: target })));
      const failed = settled.filter((s) => s.status === 'rejected' || s.value === false);
      if (failed.length) {
        sayError(failed[0]?.reason, "Couldn't move that. Try again.");
        return;
      }
      setResult((prev) => (prev ? { ...prev, date: target, dayMove: null, items: prev.items.map((i) => ({ ...i, date: target })) } : prev));
      notify(`Moved to ${sheetDayWords(target, today, day)} ✓`, { tone: 'success' });
    } finally {
      endWrite();
    }
  }, [result, onUpdateLog, today, day, notify, sayError, beginWrite, endWrite]);

  const fixes = useEntryFixes({
    setLogCalories: onSetCalories,
    describeMeal: onDescribe,
    undoLogs: onUndo,
    onChanged: (item, change) => setResult((prev) => {
      if (!prev) return prev;
      const items = applyItemChange(prev.items, item, change);
      return items.length ? { ...prev, items } : null;
    }),
  });

  // ── Rendering ────────────────────────────────────────────────────────
  const offline = !isOnline;
  // The day words in this sheet, in one style (L22).
  const dayWords = (d) => sheetDayWords(d, today, day);
  const status = useMemo(() => {
    // "Saved here" only where the draft really outlives the sheet (L18).
    if (offline) return { text: keepDraft && !draftsAvailable() ? OFFLINE_UNSAVED_MESSAGE : OFFLINE_COMPOSER_MESSAGE, tone: 'strong' };
    if (thinking) return { text: slow ? STILL_WORKING_MESSAGE : 'I’m working out the calories.', tone: slow ? 'strong' : 'muted' };
    if (failure) return { text: failure.message, tone: 'strong' };
    if (typed && sentence && onDescribe) return { text: 'I’ll work out the calories. You can fix anything after.', tone: 'muted' };
    return { text: null, tone: 'muted' };
  }, [offline, keepDraft, thinking, slow, failure, typed, sentence, onDescribe]);

  // "1 added to lunch": the sitting's meal, when it is one meal on one day.
  const sessionWhere = session.length
    && session.every((e) => e.mealType === session[0].mealType && e.date === session[0].date)
    ? sheetMealOnDay(mealWord(session[0].mealType || mealType), session[0].date || day, today, day)
    : null;

  const pillButton = { minHeight: 48, borderRadius: 999, fontWeight: 800, fontSize: '1rem', px: 2.5, boxShadow: 'none' };

  if (result) {
    // Entries that landed in different meals are named per row (L6); the
    // header then names only the day.
    const mixed = new Set(result.items.map((i) => i.mealType || result.mealType)).size > 1;
    const where = mixed
      ? (result.date === today ? 'today' : dayWords(result.date))
      : sheetMealOnDay(mealWord(result.mealType), result.date, today, day);
    return (
      <Box className={className} data-testid="result-card" sx={{ pb: 1 }}>
        <Box
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderRadius: '20px',
            border: `2px solid ${alpha(theme.palette.primary.main, 0.55)}`,
            bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.1 : 0.05),
          }}
        >
          <Typography component="h3" role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '1.375rem', fontWeight: 800, color: 'text.primary', mb: 0.5 }}>
            <AddedIcon sx={{ color: theme.palette.primary.main, fontSize: 28 }} aria-hidden />
            Added to {where}
          </Typography>
          {result.heard && (
            <Typography sx={{ fontSize: '1rem', color: 'text.secondary', mb: 1, overflowWrap: 'anywhere' }}>
              I heard: &ldquo;{result.heard}&rdquo;
            </Typography>
          )}
          <EntryList items={result.items} onFix={onSetCalories || onDescribe ? setFixing : undefined} busy={busy} showMeal={mixed} />

          <PortionQuestion question={question} busy={busy} onAnswer={answerQuestion} onDismiss={() => setQuestion(null)} />

          {result.skipped.length > 0 && (
            <Box sx={{ mt: 1.5 }} data-testid="partial">
              <Typography sx={{ fontSize: '1rem', color: 'text.primary', fontWeight: 600 }}>
                Logged {result.what}. I couldn&apos;t work out {quoted(result.skipped)}.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                {result.skipped.map((name) => (
                  <Button key={name} variant="outlined" disabled={busy} onClick={() => pickFragment(name)} sx={{ ...pillButton, borderWidth: 2, '&:hover': { borderWidth: 2 } }}>
                    Pick {name.toLowerCase()}
                  </Button>
                ))}
              </Box>
            </Box>
          )}

          {result.dayMove && (
            <Box sx={{ mt: 1.5 }} data-testid="day-move">
              <Typography sx={{ fontSize: '1rem', color: 'text.primary', fontWeight: 600 }}>
                {result.dayMove.words ? <>You said &ldquo;{result.dayMove.words}&rdquo;. </> : null}
                This is in {dayWords(result.date)}&apos;s log.
              </Typography>
              <Button variant="outlined" disabled={busy || !onUpdateLog} onClick={moveResultDay} sx={{ ...pillButton, mt: 1, borderWidth: 2, '&:hover': { borderWidth: 2 } }}>
                Move it to {dayWords(result.dayMove.target)}
              </Button>
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'center' }}>
            <Button startIcon={<UndoIcon />} onClick={undoResult} disabled={busy || !onUndo} sx={{ ...pillButton, color: 'text.primary', px: 1.5 }}>
              Undo all
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" onClick={finishResult} disabled={busy} data-testid="result-done" sx={{ ...pillButton, minHeight: 52, px: 3.5 }}>
              Done ✓
            </Button>
          </Box>
        </Box>

        <FixSheet item={fixing} onClose={() => setFixing(null)} fixes={fixes} />
      </Box>
    );
  }

  return (
    <Box className={className} sx={{ pb: session.length >= 1 ? 1 : 0 }}>
      <ComposerBox
        value={query}
        onChange={(e) => changeQuery(e.target.value)}
        onSubmit={() => (onDescribe ? pressLogIt() : null)}
        onMicClick={micAvailable ? toggleMic : undefined}
        micDisabled={micOff}
        listening={speech.listening}
        thinking={thinking}
        canLog={Boolean(typed) && Boolean(onDescribe) && !offline && !busy && !dayAsk}
        // A short name opens the list, and its rows lead (L20).
        quiet={Boolean(typed) && !sentence && Boolean(onDescribe)}
        autoFocus={autoFocus || mode === 'dialog'}
        inputRef={inputRef}
        status={status.text}
        statusTone={status.tone}
      />

      {speech.listening && (
        <Box
          role="status"
          aria-live="polite"
          data-testid="mic-listening"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            mb: 2,
            px: 2,
            py: 1.5,
            borderRadius: '18px',
            bgcolor: alpha(theme.palette.primary.main, 0.1),
            border: `2px solid ${theme.palette.primary.main}`,
          }}
        >
          <Box
            aria-hidden
            sx={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              bgcolor: theme.palette.primary.main,
              flexShrink: 0,
              animation: 'fgMicPulse 1.2s ease-in-out infinite',
              '@keyframes fgMicPulse': {
                '0%, 100%': { transform: 'scale(1)', opacity: 1 },
                '50%': { transform: 'scale(1.5)', opacity: 0.55 },
              },
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1.0625rem', color: 'text.primary' }}>
              Listening… say what you ate
            </Typography>
            {speech.interim && (
              <Typography sx={{ fontSize: '1rem', color: 'text.primary', overflowWrap: 'anywhere' }}>
                &ldquo;{speech.interim}&rdquo;
              </Typography>
            )}
          </Box>
          <Button variant="contained" onClick={speech.stop} sx={{ minHeight: 44, flexShrink: 0 }}>
            Done
          </Button>
        </Box>
      )}

      {failure?.kind === 'signed-out' && (
        <Box sx={{ mb: 2 }}>
          <SignInButton sx={{ minHeight: 48, px: 3 }} />
        </Box>
      )}

      {speech.errorText && (
        <Alert severity="info" onClose={speech.clearError} sx={{ mb: 1.5, borderRadius: 2, fontSize: '1rem' }} data-testid="mic-error">
          {speech.errorText}
        </Alert>
      )}

      {/* Which day, before anything is written (Phase 3.17). */}
      {dayAsk && (
        <Box
          role="group"
          aria-labelledby="composer-day-question"
          data-testid="day-confirm"
          sx={{
            mb: 2,
            p: 1.5,
            borderRadius: '18px',
            border: `2px solid ${theme.palette.primary.main}`,
            bgcolor: theme.palette.background.paper,
          }}
        >
          <Typography id="composer-day-question" sx={{ fontSize: '1.0625rem', fontWeight: 800, color: 'text.primary', mb: 1 }}>
            Log this to {dayWords(dayAsk.target)}?
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="contained" onClick={() => runDescribe(dayAsk.text, dayAsk.target, { spoken: dayAsk.spoken, askedDay: true })} sx={{ ...pillButton, minWidth: 96 }}>
              Yes
            </Button>
            <Button variant="outlined" onClick={() => runDescribe(dayAsk.text, day, { spoken: dayAsk.spoken, askedDay: true })} sx={{ ...pillButton, borderWidth: 2, '&:hover': { borderWidth: 2 } }}>
              No, {dayWords(day)}
            </Button>
          </Box>
        </Box>
      )}

      {/* "Pick crackers" when nothing at all could be logged. */}
      {failure?.picks?.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          {failure.picks.map((name) => (
            <Button key={name} variant="outlined" disabled={busy} onClick={() => pickFragment(name)} sx={{ ...pillButton, borderWidth: 2, '&:hover': { borderWidth: 2 } }}>
              Pick {name.toLowerCase()}
            </Button>
          ))}
        </Box>
      )}

      {onMealTypeChange && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }} role="group" aria-label="Which meal">
          {['breakfast', 'lunch', 'dinner', 'snack'].map((m) => (
            <Chip
              key={m}
              label={m === 'snack' ? 'Snacks' : m.charAt(0).toUpperCase() + m.slice(1)}
              onClick={() => onMealTypeChange(m)}
              disabled={busy}
              aria-pressed={m === mealType}
              color={m === mealType ? 'primary' : 'default'}
              variant={m === mealType ? 'filled' : 'outlined'}
              sx={{ height: 44, borderRadius: 999, fontWeight: 700, fontSize: '0.9375rem', '& .MuiChip-label': { px: 1.75 } }}
            />
          ))}
        </Box>
      )}

      {/* Asked only after the food is already in the log, and only when the
          spread is wide enough to matter. Ignoring it costs nothing. */}
      <PortionQuestion question={question} busy={busy} onAnswer={answerQuestion} onDismiss={() => setQuestion(null)} />

      {!typed && showQuickPicks && (
        <QuickPicks
          date={day}
          mealType={mealType}
          busy={busy}
          pendingKey={pendingKey}
          heading="Or tap one you’ve had"
          added={addedByKey}
          onPick={handleQuick}
          onMore={onUpdateLog ? handleMore : undefined}
        />
      )}

      <UnifiedFoodSearch
        query={query}
        sentence={sentence}
        describeAvailable={Boolean(onDescribe)}
        collapseIdleList={collapseIdleList}
        ketoMode={ketoMode}
        dense={mode === 'dialog'}
        busy={busy}
        pendingKey={pendingKey}
        added={addedByKey}
        onPick={handlePick}
        onAdjust={setAdjusting}
        onMore={onUpdateLog ? rowMore : undefined}
        onCreateFood={onCreateFood}
      />

      {!typed && onBarcodeClick && (
        <Button
          variant="text"
          startIcon={<BarcodeIcon />}
          onClick={onBarcodeClick}
          disabled={busy}
          sx={{ mt: 1.5, minHeight: 44, fontWeight: 700, fontSize: '1rem' }}
        >
          Scan a barcode
        </Button>
      )}

      <SessionRibbon
        items={session}
        where={sessionWhere}
        onUndoLast={onUndo ? undoLast : undefined}
        onDone={finishSession}
        busy={busy}
      />

      <ServingSheet
        open={Boolean(adjusting)}
        food={adjusting}
        defaultMealType={mealType}
        onClose={() => setAdjusting(null)}
        onConfirm={(food, m) => {
          setAdjusting(null);
          logFoods([food], m, identityOf(food));
        }}
      />
    </Box>
  );
};

export default FoodComposer;
