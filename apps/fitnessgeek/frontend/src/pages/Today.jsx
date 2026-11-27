import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Typography, useMediaQuery } from '@mui/material';
import { Add as AddIcon, People as PeopleIcon } from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { Link as RouterLink, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import { useToast } from '@geeksuite/ui';

import AIInsightsCard from '../components/Dashboard/AIInsightsCard.jsx';
import PlanAccuracyBanner from '../components/Dashboard/PlanAccuracyBanner.jsx';
import { Surface, SurfaceSkeleton, Page } from '../components/primitives';
import DayHeader from '../components/Home/DayHeader.jsx';
import { daylightFor } from '../components/Home/daylight.js';
import WhatIsLeft from '../components/Home/WhatIsLeft.jsx';
import DayDetails from '../components/Home/DayDetails.jsx';
import MealCards from '../components/Home/MealCards.jsx';
import TodayStrip from '../components/Home/TodayStrip.jsx';
import MedsChecklist from '../components/Home/MedsChecklist.jsx';
import YourNumbers from '../components/Home/YourNumbers.jsx';
import FirstRun from '../components/Home/FirstRun.jsx';
import { useDayData } from '../components/Home/useDayData.js';
import { usePlan } from '../components/Home/usePlan.js';
import { useHourNow } from '../components/Home/useHourNow.js';
import { useLogEditing } from '../components/Home/useLogEditing.jsx';
import { leftSentence } from '../components/Home/leftWords.js';
import AddFoodDialog from '../components/FoodLog/AddFoodDialog.jsx';
import EditLogDialog from '../components/FoodLog/EditLogDialog.jsx';
import SaveMealDialog from '../components/FoodLog/SaveMealDialog.jsx';
import CopyMealDialog from '../components/FoodLog/CopyMealDialog.jsx';
import HouseholdLogView from '../components/FoodLog/HouseholdLogView.jsx';
import { nutritionOf } from '../components/FoodLog/amount.js';
import { mealOnDayL22 } from '../components/FoodLog/dayWords.js';
import FoodEditDialog from '../components/MyFoods/FoodEditDialog.jsx';
import { FoodComposer } from '../components/FoodSearch';
import { useJustAdded } from '../components/FoodSearch/useJustAdded.jsx';

import { fitnessGeekService } from '../services/fitnessGeekService.js';
import { useFoodLogging } from '../hooks/useFoodLogging.js';
import { useMedsToday } from '../hooks/useMedsToday.js';
import { useToday } from '../hooks/useToday.js';
import { useExperience } from '../contexts/ExperienceContext.jsx';
import { todayStrip } from '../utils/checkIns.js';
import { errorMessage } from '../utils/errorMessage.js';
import { netCarbs as calcNetCarbs } from '../utils/ketoMath.js';
import { greetingFor, mealTypeForHour, mealWord } from '../utils/plainWords.js';
import { MEAL_ORDER } from '../theme/theme.jsx';

/**
 * Today — the one page for a day's food (DOCS/ONE_APP_PLAN.md §1). It was
 * two pages, Home and Food log, and two modes; it is one of each now.
 *
 * It shows one day: today unless a link says otherwise (`?date=YYYY-MM-DD`),
 * with previous, next and a way back. `?meal=lunch` scrolls to that meal;
 * `?add=1` (or `?add=lunch`) opens the add sheet. `/food-log` redirects here
 * with its query, so old links and shortcuts still land.
 *
 * On a phone, top to bottom: the day (and on today a greeting); what is
 * left, as a ring and a sentence, with the macros and the rest behind "Macros
 * and details"; "What did you eat?", the page's one filled button; today's
 * check-ins; the meals, one card; "Did you take your meds?"; your numbers;
 * the AI's notes. From md up it is two columns — what is left and the meals
 * on the left; the add box itself (no button needed), the check-ins, meds,
 * numbers and notes on the right.
 *
 * "Today" comes from useToday(): an installed PWA resumed in the morning is
 * on the new day — greeting, date, meals and meds — not the one it was opened
 * on. A day gone to on purpose (backfilling last night's dinner) stays.
 *
 * A failed read is not an empty day (review L1): see useDayData. The line in
 * place of the sentence says so, with Try again; the meals say "—", never
 * "Nothing yet".
 */

export const HOME_LOAD_PROBLEM = 'Can’t reach FitnessGeek right now. What you logged is safe.';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const EMPTY_FOOD_FORM = {
  name: '',
  brand: '',
  calories_per_serving: '',
  protein_grams: '',
  carbs_grams: '',
  fat_grams: '',
  serving_size: 1,
  serving_unit: 'oz',
};

// A calendar day moved by whole days, built from its parts so it never slips.
const shiftDay = (day, by) => {
  const [y, m, d] = String(day).split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + by);
  return fitnessGeekService.formatDate(date);
};

// Where a finished log went: drop the keyboard and bring its meal into view,
// after a frame, so the reload has had its chance to fill it (review L12).
const showLoggedMeal = ({ mealType } = {}) => {
  if (typeof document === 'undefined') return;
  document.activeElement?.blur?.();
  if (!mealType) return;
  requestAnimationFrame(() => {
    document.getElementById(`meal-card-${mealType}`)
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  });
};

const Today = () => {
  const { notify } = useToast();
  const theme = useTheme();
  const experience = useExperience();
  const { displayName, completeFirstRun } = experience;
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  // `?date=…&meal=…&add=…`. Anything malformed is simply ignored.
  const [searchParams] = useSearchParams();
  const linkedDate = DAY_RE.test(searchParams.get('date') || '') ? searchParams.get('date') : null;
  const linkedMeal = MEAL_ORDER.includes(searchParams.get('meal')) ? searchParams.get('meal') : null;
  const linkedAdd = searchParams.get('add');

  const today = useToday();
  const hour = useHourNow();

  // The day on screen. If it was showing today, it moves to the new today —
  // an installed PWA left open overnight used to log breakfast to yesterday
  // (B3). A day chosen on purpose stays.
  const [selectedDate, setSelectedDate] = useState(() => linkedDate || today);
  const lastToday = useRef(today);
  useEffect(() => {
    const was = lastToday.current;
    if (was === today) return;
    lastToday.current = today;
    setSelectedDate((shown) => (shown === was ? today : shown));
  }, [today]);
  // Tapping "Today" in the navigation while on another day comes back, and a
  // new link to a day goes to it. Only a real navigation counts: Back (POP)
  // is how an open sheet closes, and must not move the day.
  const navigationType = useNavigationType();
  const firstLocation = useRef(location.key);
  useEffect(() => {
    if (firstLocation.current === location.key) return;
    firstLocation.current = location.key;
    if (navigationType === 'POP') return;
    setSelectedDate(linkedDate || lastToday.current);
  }, [location.key, linkedDate, navigationType]);
  const isToday = selectedDate === today;

  // The add sheet: whether it's open, and which meal it's on. Two pieces on
  // purpose (L18): closing used to null the meal while the sheet was still
  // on its way out, the composer saw "snack", and the lunch draft moved to
  // snack. The meal stays put when the sheet closes. The inline add box on a
  // desktop shares the same meal.
  const [addMeal, setAddMealOnly] = useState(() => (
    MEAL_ORDER.includes(linkedAdd) ? linkedAdd : linkedMeal || mealTypeForHour(new Date().getHours())
  ));
  const [addOpen, setAddOpen] = useState(() => Boolean(linkedAdd) && linkedAdd !== '0');
  const openAdd = useCallback((meal) => {
    if (meal) setAddMealOnly(meal);
    setAddOpen(true);
  }, []);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [createForm, setCreateForm] = useState(null);
  const [creatingFood, setCreatingFood] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyPrefill, setCopyPrefill] = useState(null);
  const [householdOpen, setHouseholdOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const medsRef = useRef(null);

  const dayData = useDayData({
    day: selectedDate,
    today,
    onError: () => notify('Couldn’t load today. Try again in a moment.', { tone: 'error' }),
  });
  const { data, logs, known, loadProblem, checkIns, reload, reloadFood } = dayData;
  const plan = usePlan();
  const meds = useMedsToday(today);

  const { logItems, undoLogs, describeMeal, adjustLogCalories, updateLog, setLogCalories, createFood } = useFoodLogging({ date: selectedDate, onChanged: reloadFood });
  // A describe closes the sheet and leaves a "Just added" strip on the meal
  // it landed in. It stays until the next action; moving to another day is one.
  const justAdded = useJustAdded({ setLogCalories, describeMeal, undoLogs });
  const clearJustAdded = justAdded.clear;
  useEffect(() => { clearJustAdded(); }, [selectedDate, clearJustAdded]);

  const editing = useLogEditing({ logs, day: selectedDate, today, reloadFood, logItems, onRemoved: justAdded.forget });

  // Scroll to the linked meal once, after its rows have loaded — scrolling
  // before then lands on a meal that is about to grow.
  const scrolledToLinkedMeal = useRef(false);
  useEffect(() => {
    if (!linkedMeal || dayData.loading || scrolledToLinkedMeal.current) return;
    scrolledToLinkedMeal.current = true;
    requestAnimationFrame(() => {
      document.getElementById(`meal-card-${linkedMeal}`)
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
  }, [linkedMeal, dayData.loading]);

  // "Can't find it? Create …": the one food form, with the name filled in;
  // the new food is logged to the meal the box was on.
  const handleCreateFood = async () => {
    if (!createForm?.name) return;
    setCreatingFood(true);
    try {
      const created = await createFood({
        name: createForm.name.trim(),
        brand: createForm.brand?.trim() || undefined,
        nutrition: {
          calories_per_serving: Number(createForm.calories_per_serving) || 0,
          protein_grams: Number(createForm.protein_grams) || 0,
          carbs_grams: Number(createForm.carbs_grams) || 0,
          fat_grams: Number(createForm.fat_grams) || 0,
        },
        serving: {
          size: Number(createForm.serving_size) || 1,
          unit: createForm.serving_unit || 'oz',
        },
      });
      setCreateForm(null);
      if (created) await logItems([{ ...created, servings: 1 }], addMeal);
    } catch (error) {
      notify(errorMessage(error, 'Couldn’t save that food. Try again.'), { tone: 'error' });
    } finally {
      setCreatingFood(false);
    }
  };

  const retryLoad = async () => {
    setRetrying(true);
    try { await reload(); } finally { setRetrying(false); }
  };

  // Keto: a food with no fiber listed counts all its carbs.
  const missingFiber = useMemo(
    () => plan.keto && logs.some((log) => (log.food_item || log.food_item_id) && calcNetCarbs(nutritionOf(log)).isMissingFiber),
    [plan.keto, logs]
  );

  const eaten = data.calories.consumed;
  const goal = data.calories.goal;
  const sentence = leftSentence({ eaten, goal, day: selectedDate, today });
  // The first run asked the goal; "lose a little" with no target gets the one
  // step that helps, not "No daily target is set" (review Phase 2.14) — but
  // only when the target was actually read, never off a failed read.
  const offerTarget = isToday && !loadProblem && known.goals && !(goal > 0) && experience.goal === 'lose';
  const mealsLogged = MEAL_ORDER.filter((m) => logs.some((log) => (MEAL_ORDER.includes(log.meal_type) ? log.meal_type : 'snack') === m)).length;
  const detailText = `${offerTarget ? 'A daily target makes losing a little easier.' : sentence.detail}${
    known.logs && mealsLogged > 0 ? ` · ${mealsLogged} ${mealsLogged === 1 ? 'meal' : 'meals'} logged` : ''}`;
  const daylight = daylightFor(hour, theme.palette.mode);
  const greeting = `${greetingFor(hour)}${displayName ? `, ${displayName}` : ''}`;
  const strip = todayStrip({
    weights: checkIns.weights,
    bloodPressures: checkIns.bloodPressures,
    // Unknown ticks are "Meds ?", never "0 of 3" (review 2026-11 #3).
    meds: meds.loading ? null : { taken: meds.taken, total: meds.total, unknown: meds.ticksUnknown },
    today,
  });

  const composerProps = {
    mealType: addMeal,
    onMealTypeChange: (meal) => meal && setAddMealOnly(meal),
    onLogItems: logItems,
    onDescribe: describeMeal,
    onAdjustCalories: adjustLogCalories,
    onUndo: undoLogs,
    onUpdateLog: updateLog,
    onSetCalories: setLogCalories,
    onJustAdded: justAdded.show,
    ketoMode: plan.keto,
    date: selectedDate,
  };

  // Every meal's "Add", and "What did you eat?", open the same box in a
  // sheet, with the meal already chosen.
  const addDialog = (
    <AddFoodDialog
      {...composerProps}
      open={addOpen}
      onClose={({ mealType } = {}) => {
        setAddOpen(false);
        showLoggedMeal({ mealType });
      }}
      onCreateFood={(query) => {
        setAddOpen(false);
        setCreateForm({ ...EMPTY_FOOD_FORM, name: query });
      }}
      showBarcodeScanner={showBarcodeScanner}
      onShowBarcodeScanner={setShowBarcodeScanner}
    />
  );

  // A failed first-run save says so; it used to vanish without a word.
  const finishFirstRun = async (answers) => {
    const result = await completeFirstRun(answers);
    if (result && result.ok === false) {
      notify(errorMessage(result.error, 'Couldn’t save that. Try again.'), { tone: 'error' });
    }
    return result;
  };

  // ── First run: three steps, once, for a person who has never used the
  // app — and never while their saved settings couldn't be read
  // (ExperienceContext decides; see `needsFirstRun`).
  if (!experience.loading && experience.needsFirstRun) {
    const firstMeal = mealTypeForHour(hour);
    return (
      <Page narrow>
        <FirstRun
          suggestedName={displayName || ''}
          mealType={firstMeal}
          onFinish={finishFirstRun}
          onTryLogging={async (answers) => {
            await finishFirstRun(answers);
            openAdd(firstMeal);
          }}
        />
        {addDialog}
      </Page>
    );
  }

  const header = (
    <DayHeader
      day={selectedDate}
      today={today}
      greeting={greeting}
      daylight={daylight}
      onPrevious={() => setSelectedDate((d) => shiftDay(d, -1))}
      onNext={() => setSelectedDate((d) => shiftDay(d, 1))}
      onToday={() => setSelectedDate(today)}
    />
  );

  if (dayData.loading || experience.loading) {
    return (
      <Page>
        {header}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }} aria-busy="true">
          <SurfaceSkeleton rows={3} showHeader={false} height={240} />
          <SurfaceSkeleton rows={2} showHeader={false} height={200} />
        </Box>
        {addDialog}
      </Page>
    );
  }

  const sectionTitleSx = { fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.01em', mb: 2.5, scrollMarginTop: 88 };

  // In place of the numbers: never "Nothing logged yet" from a failed read.
  const problemBlock = loadProblem && (
    <Box role="status" data-testid="home-load-problem">
      <Typography sx={{ fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.35 }}>
        {HOME_LOAD_PROBLEM}
      </Typography>
      <Button variant="outlined" onClick={retryLoad} disabled={retrying} sx={{ mt: 2.5, minHeight: 48, fontWeight: 600, textTransform: 'none' }}>
        {retrying ? 'Trying…' : 'Try again'}
      </Button>
    </Box>
  );

  const leftCard = (
    <WhatIsLeft
      day={selectedDate}
      today={today}
      eaten={eaten}
      goal={goal}
      headline={sentence.headline}
      detail={detailText}
      problem={problemBlock || null}
      wash={isToday ? daylight.wash : null}
      offer={offerTarget && (
        <Button
          variant="outlined"
          data-testid="set-daily-target"
          // The one-screen "How fast?" form.
          onClick={() => navigate('/calorie-wizard?quick=1')}
          sx={{ mt: 3, minHeight: 48, fontWeight: 700, textTransform: 'none' }}
        >
          Set your daily target
        </Button>
      )}
      // The calorie-target warning and the scan-BMR offer: a quiet note at
      // the foot of the card, not a banner above it.
      note={(
        <PlanAccuracyBanner
          nutritionGoal={plan.nutritionGoal}
          scanBmr={plan.scanBmr}
          sx={{
            mt: 4,
            px: 3,
            py: 1,
            borderRadius: '12px',
            bgcolor: alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.16 : 0.08),
            color: 'text.primary',
          }}
        />
      )}
    >
      <DayDetails
        isToday={isToday}
        day={selectedDate}
        totals={known.summary ? { calories: eaten, netCarbs: data.netCarbs, ...data.macros } : null}
        planMode={plan.planMode}
        netCarbLimit={plan.netCarbLimit}
        proteinNote={dayData.proteinBasis === 'lean_mass' ? 'from lean mass' : null}
        missingFiber={missingFiber}
        goal={goal}
        allowance={dayData.allowance}
        onTargetSaved={async () => { plan.reload(); await reload(); }}
      />
    </WhatIsLeft>
  );

  // The page's one filled button, on a phone: "What did you eat?" opens the
  // add sheet on this hour's meal — or, on another day, on that day's meal.
  const logButton = (
    <Button
      variant="contained"
      startIcon={<AddIcon aria-hidden />}
      data-testid="what-did-you-eat"
      onClick={() => openAdd(isToday ? mealTypeForHour(hour) : null)}
      sx={{ minHeight: 56, width: '100%', fontSize: '1.125rem', fontWeight: 600, textTransform: 'none' }}
    >
      What did you eat?
    </Button>
  );

  // From md up the add box is on the page, so no button is needed. Its idle
  // list (favourites and recents) is folded: the meals are beside it.
  const inlineComposer = (
    <Surface component="section" aria-labelledby="inline-add-title" data-testid="inline-add">
      <Typography
        id="inline-add-title"
        component="h2"
        {...(isToday ? {} : { 'data-testid': 'inline-add-day' })}
        sx={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.01em', mb: 3 }}
      >
        {/* On a backfilled day the box names the day, the way the sheet
            does: "Add to Thursday's dinner (yesterday)" (UX review L22). */}
        {isToday ? 'What did you eat?' : `Add to ${mealOnDayL22(mealWord(addMeal), selectedDate, today)}`}
      </Typography>
      <FoodComposer
        {...composerProps}
        mode="page"
        collapseIdleList
        showQuickPicks
        onClose={showLoggedMeal}
        onBarcodeClick={() => setShowBarcodeScanner(true)}
        onCreateFood={(query) => setCreateForm({ ...EMPTY_FOOD_FORM, name: query })}
      />
    </Surface>
  );

  const checkInLinks = isToday && strip.length > 0 && (
    <TodayStrip
      items={strip}
      // The ticks are on this page; "Meds" brings them into view.
      onMedsClick={meds.total > 0 ? () => medsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }) : undefined}
    />
  );

  const mealsSection = (
    <Box component="section" aria-labelledby="todays-meals">
      <Typography id="todays-meals" component="h2" sx={sectionTitleSx}>
        {isToday ? 'Today’s meals' : 'Meals'}
      </Typography>
      <MealCards
        logs={logs}
        onAdd={openAdd}
        onEdit={editing.openEdit}
        onCopy={(mealType) => {
          // Into this meal on the day on screen, from the day before it.
          setCopyPrefill({ fromDate: shiftDay(selectedDate, -1), fromMealType: mealType, targetDate: selectedDate, toMealType: mealType });
          setCopyOpen(true);
        }}
        onSaveMeal={editing.openSaveMeal}
        date={selectedDate}
        justAdded={justAdded}
        unknown={!known.logs}
      />
      <Button
        variant="text"
        startIcon={<PeopleIcon aria-hidden />}
        onClick={() => setHouseholdOpen(true)}
        data-testid="household-link"
        sx={{ mt: 2, minHeight: 48, fontWeight: 600, textTransform: 'none', color: 'text.secondary' }}
      >
        What your household ate
      </Button>
    </Box>
  );

  const medsSection = isToday && (
    <>
      {/* No medications yet: a quiet way in. */}
      {!meds.loading && !meds.loadError && meds.total === 0 && (
        <Box>
          <Button
            component={RouterLink}
            to="/medications"
            variant="text"
            data-testid="track-meds"
            sx={{ minHeight: 48, fontWeight: 600, textTransform: 'none', fontSize: '1.0625rem' }}
          >
            Track your meds
          </Button>
        </Box>
      )}
      {meds.total > 0 && (
        <Surface ref={medsRef} sx={{ scrollMarginTop: 88 }}>
          <MedsChecklist
            items={meds.items}
            taken={meds.taken}
            total={meds.total}
            onToggle={meds.toggle}
            saving={meds.saving}
            error={meds.error}
            unknown={meds.ticksUnknown}
            ticksError={meds.ticksError}
            onRetry={meds.reload}
          />
        </Surface>
      )}
    </>
  );

  const numbers = <YourNumbers stats={data.stats} checkIns={checkIns} today={today} titleSx={sectionTitleSx} />;
  const column = { display: 'flex', flexDirection: 'column', gap: { xs: 5, md: 6 }, minWidth: 0 };

  return (
    <Page sx={{ gap: { xs: 4, md: 5 } }}>
      {header}

      {isDesktop ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 6, alignItems: 'start' }}>
          <Box sx={column}>
            {leftCard}
            {mealsSection}
          </Box>
          <Box sx={column}>
            {inlineComposer}
            {checkInLinks}
            {medsSection}
            {numbers}
            <AIInsightsCard />
          </Box>
        </Box>
      ) : (
        <Box sx={column}>
          {leftCard}
          {logButton}
          {checkInLinks}
          {mealsSection}
          {medsSection}
          {numbers}
          <AIInsightsCard />
        </Box>
      )}

      {addDialog}

      {/* "Can't find it? Create …" lands here, with the name already filled. */}
      <FoodEditDialog
        open={Boolean(createForm)}
        food={null}
        form={createForm || EMPTY_FOOD_FORM}
        onChange={setCreateForm}
        onClose={() => setCreateForm(null)}
        onSave={handleCreateFood}
        loading={creatingFood}
      />

      {editing.mealToSave && (
        <SaveMealDialog
          open
          onClose={editing.closeSaveMeal}
          onSave={editing.confirmSaveMeal}
          mealType={editing.mealToSave.mealType}
          logs={editing.mealToSave.logs}
          loading={editing.savingMeal}
        />
      )}

      {editing.editingLog && (
        <EditLogDialog
          open
          onClose={editing.closeEdit}
          onSave={editing.saveEdit}
          onRemove={editing.removeFromEdit}
          log={editing.editingLog}
          loading={editing.updating}
        />
      )}

      <CopyMealDialog
        open={copyOpen}
        onClose={() => {
          setCopyOpen(false);
          setCopyPrefill(null);
        }}
        currentDate={selectedDate}
        prefill={copyPrefill}
        onCopyComplete={(toDate) => {
          if (toDate === selectedDate) reloadFood();
        }}
      />

      <HouseholdLogView
        open={householdOpen}
        onClose={() => setHouseholdOpen(false)}
        currentDate={selectedDate}
        onCopyMeal={(copyData) => {
          // Straight into the copy dialog, already filled in.
          setHouseholdOpen(false);
          setCopyPrefill(copyData || null);
          setCopyOpen(true);
        }}
      />
    </Page>
  );
};

export default Today;
