/**
 * The food composer: "just tell it what you ate" (REVIEW_2026-10 §4,
 * Phase 3.16), with the exact-food list as the half you ask for.
 *
 * This file was UnifiedFoodSearch.test.jsx. Every case from it is still here,
 * moved onto the new surface: the box is "Tell me what you ate" with a Log it
 * button instead of a "Log '…'" row inside the results. What changed on
 * purpose, and is pinned below as such:
 *
 *   - "Create '<sentence>'" is hidden for a sentence; it's still offered for a
 *     name (the old case typed a three-word sentence, now it types one word).
 *   - The deep search no longer runs for a sentence or under three
 *     characters (the old "one character" case is now two).
 *   - Rails-skipped and 422 copy is the new plain wording.
 *   - The "showing its parts" note sits under the list.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';
import { ExperienceContext } from '../../contexts/ExperienceContext.jsx';

const suggest = vi.fn();
const search = vi.fn();

vi.mock('../../services/foodService', () => ({
  foodService: {
    suggest: (...args) => suggest(...args),
    search: (...args) => search(...args)
  }
}));
// Wednesday. The day chip and the sheet's day words count from here.
const TODAY = '2026-10-14';
vi.mock('../../hooks/useToday.js', () => ({ useToday: () => '2026-10-14' }));
// The quick picks' sources; empty unless a test fills them.
const recent = { logs: [], meals: [], loading: false };
vi.mock('../../hooks/useRecentLogs.js', () => ({ useRecentLogs: () => recent, forgetRecentLogs: vi.fn() }));
let household = [];
vi.mock('../FoodSearch/useHouseholdMeals.js', () => ({ useHouseholdMeals: () => household }));
const loginRedirect = vi.fn();
vi.mock('@geeksuite/auth', async (importOriginal) => ({ ...(await importOriginal()), loginRedirect: (...a) => loginRedirect(...a) }));

const { default: FoodComposer } = await import('../FoodSearch/FoodComposer.jsx');
const { forgetDrafts } = await import('../FoodSearch/composerDraft.js');

const food = (name, overrides = {}) => ({
  id: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  source: 'usda',
  nutrition: { calories_per_serving: 200, protein_grams: 6, carbs_grams: 30, fat_grams: 8 },
  ...overrides
});

const SIMPLE = { isSimple: true, effectiveMode: 'simple', loading: false, known: true };

const renderBox = (props = {}, { simple = false } = {}) => {
  const box = <FoodComposer onLogItems={vi.fn()} {...props} />;
  return render(
    <GeekToastProvider>
      {simple ? <ExperienceContext.Provider value={SIMPLE}>{box}</ExperienceContext.Provider> : box}
    </GeekToastProvider>
  );
};

const theBox = () => screen.getByLabelText('Tell me what you ate');
const type = (value) => fireEvent.change(theBox(), { target: { value } });
const logIt = () => fireEvent.click(screen.getByTestId('log-it'));

const setOnline = (online) => Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  suggest.mockResolvedValue([]);
  search.mockResolvedValue([]);
  setOnline(true);
  recent.logs = [];
  recent.meals = [];
  household = [];
  forgetDrafts();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  setOnline(true);
});

describe('typing, not submitting', () => {
  it('asks the local catalog shortly after you stop typing — no button press', async () => {
    renderBox();
    type('pancakes');

    expect(suggest).not.toHaveBeenCalled();   // not on the keystroke itself
    await vi.advanceTimersByTimeAsync(200);

    expect(suggest).toHaveBeenCalledWith('pancakes', expect.objectContaining({ limit: 15 }));
    // The slow wave has NOT gone yet — the local answer paints first.
    expect(search).not.toHaveBeenCalled();
  });

  it('follows up with the food databases on a longer pause', async () => {
    renderBox();
    type('pancakes');
    await vi.advanceTimersByTimeAsync(500);

    expect(search).toHaveBeenCalledWith('pancakes', expect.objectContaining({ limit: 25 }));
  });

  it('does not reach the databases under three characters (Phase 1.9: "Ha" was an AI search)', async () => {
    renderBox();
    type('ha');
    await vi.advanceTimersByTimeAsync(600);

    expect(search).not.toHaveBeenCalled();
    // …but your own foods still answer.
    expect(suggest).toHaveBeenCalledWith('ha', expect.anything());
  });

  it('shows local results before the databases answer', async () => {
    suggest.mockResolvedValue([food('My Pancakes', { source: 'custom' })]);
    search.mockImplementation(() => new Promise(() => {}));   // never settles

    renderBox();
    type('pancakes');
    await vi.advanceTimersByTimeAsync(600);

    expect(await screen.findByText('My Pancakes')).toBeInTheDocument();
  });

  it('appends database results to what is already on screen', async () => {
    suggest.mockResolvedValue([food('My Pancakes', { source: 'custom' })]);
    search.mockResolvedValue([food('Pancakes, chocolate chip')]);

    renderBox();
    type('pancakes');
    await vi.advanceTimersByTimeAsync(600);

    expect(await screen.findByText('My Pancakes')).toBeInTheDocument();
    expect(await screen.findByText('Pancakes, chocolate chip')).toBeInTheDocument();
  });

  it('a late batch never moves a row that is already on screen', async () => {
    // Chef: "the entry form bounces around a lot on the desktop". The deep
    // wave answers with the local row LAST; it must stay first.
    suggest.mockResolvedValue([food('My Pancakes', { source: 'custom' })]);
    search.mockResolvedValue([food('Pancakes, buttermilk'), food('My Pancakes', { source: 'custom' })]);
    renderBox();
    type('pancakes');
    await vi.advanceTimersByTimeAsync(200);
    await screen.findByText('My Pancakes');
    await vi.advanceTimersByTimeAsync(500);
    await screen.findByText('Pancakes, buttermilk');

    const names = screen.getAllByTestId('food-row').map((row) => row.textContent);
    expect(names[0]).toMatch(/^My Pancakes/);
    expect(names[1]).toMatch(/^Pancakes, buttermilk/);
  });
});

describe('a sentence folds the list away (Phase 1.1, 2.10)', () => {
  it('folds the list into "Or pick an exact food (n)" and runs no deep search', async () => {
    suggest.mockResolvedValue([food('Chicken noodle soup'), food('Saltine crackers')]);
    renderBox({ onDescribe: vi.fn() });
    type('a bowl of chicken soup and some crackers');
    await vi.advanceTimersByTimeAsync(800);

    const toggle = await screen.findByRole('button', { name: /or pick an exact food/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('2');
    expect(screen.queryByText('Chicken noodle soup')).toBeNull();
    expect(search).not.toHaveBeenCalled();
    // The suggest that counts the list is the only call.
    expect(suggest).toHaveBeenCalledWith('a bowl of chicken soup and some crackers', expect.objectContaining({ meals: true }));
  });

  it('never says "Nothing found" or "Try fewer words", and hides "Create \'<sentence>\'"', async () => {
    const onCreateFood = vi.fn();
    renderBox({ onDescribe: vi.fn(), onCreateFood });
    type('a bowl of chicken soup and some crackers');
    await vi.advanceTimersByTimeAsync(800);

    expect(screen.queryByText(/nothing found/i)).toBeNull();
    expect(screen.queryByText(/fewer words/i)).toBeNull();
    expect(screen.queryByText(/can't find it/i)).toBeNull();
    expect(screen.getByText(/I’ll work out the calories. You can fix anything after./)).toBeInTheDocument();
  });

  it.each([
    ['2 eggs'], ['eggs and toast'], ['coffee with cream'], ['pb&j'], ['eggs, toast'], ['eggs + toast'], ['a turkey sandwich'],
  ])('"%s" is a sentence', async (text) => {
    suggest.mockResolvedValue([food('Egg')]);
    renderBox({ onDescribe: vi.fn() });
    type(text);
    await vi.advanceTimersByTimeAsync(800);
    expect(await screen.findByRole('button', { name: /or pick an exact food/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opening the fold shows the rows, and only then asks the databases', async () => {
    suggest.mockResolvedValue([food('Pure Protein bar')]);
    renderBox({ onDescribe: vi.fn() });
    type('pure protein bar');
    await vi.advanceTimersByTimeAsync(800);
    expect(search).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: /or pick an exact food/i }));
    expect(await screen.findByText('Pure Protein bar')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(500);
    expect(search).toHaveBeenCalledWith('pure protein bar', expect.anything());
  });

  it('a short name ("fage") shows the list open, each row with "+ Add" and "cal"', async () => {
    suggest.mockResolvedValue([food('Fage Total 2%', { nutrition: { calories_per_serving: 190 } })]);
    renderBox({ onDescribe: vi.fn() });
    type('fage');
    await vi.advanceTimersByTimeAsync(300);

    const row = (await screen.findAllByTestId('food-row'))[0];
    expect(row).toHaveTextContent('+ Add');
    expect(row).toHaveTextContent('190 cal');
    expect(screen.queryByRole('button', { name: /or pick an exact food/i })).toBeNull();
  });

  it('a name with no match says Log it will work it out — never "Try fewer words"', async () => {
    renderBox({ onDescribe: vi.fn() });
    type('quesadila');
    await vi.advanceTimersByTimeAsync(800);

    expect(await screen.findByText('Tap Log it and I’ll work it out.')).toBeInTheDocument();
    expect(screen.queryByText(/fewer words/i)).toBeNull();
  });
});

describe('one tap logs it', () => {
  it('logs the tapped food with its serving, and does not ask again', async () => {
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['log-1'] });
    suggest.mockResolvedValue([food('Pancakes', { requestedQuantity: 4 })]);

    renderBox({ onLogItems, mealType: 'breakfast' });
    type('pancakes');
    await vi.advanceTimersByTimeAsync(200);

    fireEvent.click(await screen.findByText('Pancakes'));

    await waitFor(() => expect(onLogItems).toHaveBeenCalledTimes(1));
    const [items, meal] = onLogItems.mock.calls[0];
    expect(items[0]).toMatchObject({ name: 'Pancakes', servings: 4 });
    expect(meal).toBe('breakfast');
  });

  it('offers an undo that deletes exactly what it wrote', async () => {
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['log-1'] });
    const onUndo = vi.fn().mockResolvedValue();
    suggest.mockResolvedValue([food('Pancakes')]);

    renderBox({ onLogItems, onUndo });
    type('pancakes');
    await vi.advanceTimersByTimeAsync(200);
    fireEvent.click(await screen.findByText('Pancakes'));

    fireEvent.click(await screen.findByRole('button', { name: /^undo$/i }));
    await waitFor(() => expect(onUndo).toHaveBeenCalledWith(['log-1']));
  });

  it('never closes anything on a single tap — building the tray is the point', async () => {
    // Chef: "Clicking individual items is fine with the pop up count/tray it
    // has." Picking several results is a session the person ends.
    const onClose = vi.fn();
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['log-1'] });
    suggest.mockResolvedValue([food('Pancakes')]);

    renderBox({ onLogItems, onClose });
    type('pancakes');
    await vi.advanceTimersByTimeAsync(200);
    fireEvent.click(await screen.findByText('Pancakes'));

    await waitFor(() => expect(onLogItems).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('"Make it 2": after an add, one tap makes that entry two servings — not a second entry', async () => {
    // Heather taps "Egg" twice for two eggs (§2a).
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['egg-1'], perItem: [['egg-1']] });
    const onUpdateLog = vi.fn().mockResolvedValue(true);
    suggest.mockResolvedValue([food('Egg', { nutrition: { calories_per_serving: 72 } })]);
    renderBox({ onLogItems, onUpdateLog });
    type('egg');
    await vi.advanceTimersByTimeAsync(200);

    fireEvent.click(await screen.findByText('Egg'));
    fireEvent.click(await screen.findByRole('button', { name: 'Make it 2 Egg' }));
    await waitFor(() => expect(onUpdateLog).toHaveBeenCalledWith('egg-1', { servings: 2 }));
    expect(onLogItems).toHaveBeenCalledTimes(1);

    fireEvent.click(await screen.findByRole('button', { name: 'Make it 3 Egg' }));
    await waitFor(() => expect(onUpdateLog).toHaveBeenLastCalledWith('egg-1', { servings: 3 }));
  });

  it('a saved meal from suggest logs as a meal (logMeal), never as a food', async () => {
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['a', 'b'], perItem: [['a', 'b']] });
    suggest.mockResolvedValue([
      { kind: 'meal', id: 'meal-9', name: 'Homemade Quesadilla', meal_type: 'dinner', food_count: 3, nutrition: { calories_per_serving: 725 }, source: 'meal' },
      food('Quesadilla, cheese'),
    ]);
    renderBox({ onLogItems, mealType: 'dinner' });
    type('quesa');
    await vi.advanceTimersByTimeAsync(200);

    const row = await screen.findByRole('button', { name: /Add Homemade Quesadilla, 725 cal/ });
    expect(screen.getByText(/Saved meal · 3 foods/)).toBeInTheDocument();
    fireEvent.click(row);
    await waitFor(() => expect(onLogItems).toHaveBeenCalledWith([expect.objectContaining({ id: 'meal-9', type: 'meal' })], 'dinner'));
    // A meal is several entries: no "Make it 2".
    expect(screen.queryByRole('button', { name: /make it 2/i })).toBeNull();
  });
});

describe('dead ends', () => {
  it('offers to create a name you typed', async () => {
    const onCreateFood = vi.fn();
    renderBox({ onCreateFood });
    type('crostini');
    await vi.advanceTimersByTimeAsync(600);

    fireEvent.click(await screen.findByText(/crostini/i, { selector: 'strong' }));
    expect(onCreateFood).toHaveBeenCalledWith('crostini');
  });

  it('says so when the backend fell back to ingredients', async () => {
    search.mockResolvedValue([
      food('Chocolate chips', { compositeItem: 'chocolate chip', decomposedFrom: 'chip pancakes' })
    ]);

    renderBox();
    type('chip pancakes');
    await vi.advanceTimersByTimeAsync(600);

    expect(await screen.findByText(/its parts are listed/i)).toBeInTheDocument();
  });

  it('keeps your own foods listed when the databases fail', async () => {
    suggest.mockResolvedValue([food('My Pancakes', { source: 'custom' })]);
    search.mockRejectedValue(new Error('USDA is down'));

    renderBox();
    type('pancakes');
    await vi.advanceTimersByTimeAsync(600);

    expect(await screen.findByText('My Pancakes')).toBeInTheDocument();
  });
});

/**
 * Describe-and-log: the path Chef actually asked for, and now the obvious one.
 */
describe('describing a meal', () => {
  const describeMeal = vi.fn();

  const renderDescribable = (props = {}, opts) => renderBox({ onDescribe: describeMeal, ...props }, opts);

  const logged = (over = {}) => ({
    logId: 'log-1',
    name: 'Chocolate chip pancakes',
    servings: 4,
    loggedServings: 1,
    mealType: 'breakfast',
    calories: 880,
    nutrition: { calories_per_serving: 880 },
    source: 'estimate',
    flags: [],
    ...over
  });

  beforeEach(() => {
    describeMeal.mockReset();
    describeMeal.mockResolvedValue({
      ok: 1, fail: 0, logIds: ['log-1'], logged: [logged()], skipped: [], questions: [], totalCalories: 880
    });
  });

  it('the box says what to do, and Log it sits right under it', async () => {
    renderDescribable();
    expect(theBox()).toHaveAttribute('placeholder', 'e.g. a bowl of chicken soup and some crackers');
    expect(theBox()).toHaveAttribute('enterkeyhint', 'send');
    expect(theBox().tagName).toBe('TEXTAREA');
    expect(screen.getByText(/Say it like you’d tell a friend\. I’ll work out the calories\./)).toBeInTheDocument();
    // Dim until there are words.
    expect(screen.getByTestId('log-it')).toBeDisabled();
    type('4 chocolate chip pancakes homemade');
    expect(screen.getByTestId('log-it')).toBeEnabled();
  });

  it('names a saved meal in the toast, not its component count', async () => {
    const meal = { id: 'm1', name: 'Homemade Quesadilla' };
    const rows = ['Flour tortilla', 'Cheese', 'Chicken', 'Black beans', 'Sour cream', 'Guacamole', 'Cream cheese']
      .map((name, i) => logged({ logId: `c${i}`, name, calories: 100, source: 'saved-meal', savedMeal: meal }));
    describeMeal.mockResolvedValue({
      ok: 7, fail: 0, logIds: rows.map((r) => r.logId), logged: rows, skipped: [], questions: [], totalCalories: 725
    });
    renderDescribable();
    type('homemade quesadilla');
    logIt();

    expect(await screen.findByText('Added to breakfast ✓ · Homemade Quesadilla · 725 cal')).toBeInTheDocument();
    expect(screen.queryByText(/7 items/)).not.toBeInTheDocument();
  });

  it('names a saved meal alongside what else was said', async () => {
    const meal = { id: 'm2', name: "Fat Boy's Burger and Fries" };
    const rows = [
      logged({ logId: 'b', name: 'Burger', calories: 600, source: 'saved-meal', savedMeal: meal }),
      logged({ logId: 'f', name: 'Fries', calories: 230, source: 'saved-meal', savedMeal: meal }),
      logged({ logId: 'k', name: 'Coke', calories: 140 }),
    ];
    describeMeal.mockResolvedValue({
      ok: 3, fail: 0, logIds: ['b', 'f', 'k'], logged: rows, skipped: [], questions: [], totalCalories: 970
    });
    renderDescribable();
    type("fat boy's burger and fries and a coke");
    logIt();

    expect(await screen.findByText("Added to breakfast ✓ · Fat Boy's Burger and Fries and Coke · 970 cal")).toBeInTheDocument();
  });

  it('logs on Enter; Shift+Enter is a new line', async () => {
    renderDescribable();
    type('a dozen nachos with beef and cheese');

    fireEvent.keyDown(theBox(), { key: 'Enter', shiftKey: true });
    expect(describeMeal).not.toHaveBeenCalled();

    fireEvent.keyDown(theBox(), { key: 'Enter' });
    // The box's meal rides along, so the server need not guess it from the clock.
    await waitFor(() => expect(describeMeal).toHaveBeenCalledWith('a dozen nachos with beef and cheese', expect.objectContaining({ mealType: 'snack', idempotencyKey: expect.any(String), date: TODAY })));
  });

  it('logs when Log it is tapped', async () => {
    renderDescribable();
    type('  eggs and toast  ');

    logIt();
    await waitFor(() => expect(describeMeal).toHaveBeenCalledWith('eggs and toast', expect.objectContaining({ mealType: 'snack', idempotencyKey: expect.any(String) })));
  });

  it('clears the box once it is written, so the same meal is not logged twice', async () => {
    renderDescribable();
    type('nachos');

    logIt();
    await waitFor(() => expect(theBox()).toHaveValue(''));
  });

  it('says what landed, not just that something did', async () => {
    renderDescribable();
    type('pancakes');
    logIt();

    expect(await screen.findByText(/Chocolate chip pancakes · 880 cal/)).toBeInTheDocument();
  });

  it('partial: names what was logged and what wasn\'t, with a way to pick the missing one', async () => {
    // A line can partly succeed: one dish writes, its neighbour is nonsense.
    describeMeal.mockResolvedValue({
      ok: 1, fail: 1, logIds: ['log-1'],
      logged: [logged({ name: 'Chicken soup', calories: 220 })],
      skipped: [{ name: 'crackers', reason: 'no-match' }],
      questions: [], totalCalories: 220
    });
    suggest.mockResolvedValue([food('Saltine crackers')]);
    renderDescribable();
    type('a bowl of chicken soup and some crackers');
    logIt();

    expect(await screen.findByText("Added Chicken soup. I couldn’t work out “crackers”.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pick crackers' }));
    // Back to the box, filtered to the fragment, with the list open.
    await waitFor(() => expect(theBox()).toHaveValue('crackers'));
    await vi.advanceTimersByTimeAsync(300);
    expect(await screen.findByText('Saltine crackers')).toBeInTheDocument();
  });

  it('closes the sheet on a clean log in Full — Chef: "the one-tap ... should close"', async () => {
    const onClose = vi.fn();
    renderDescribable({ onClose });
    type('pancakes');
    logIt();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    // Which meal it landed in — the Food Log page has no sheet to close and
    // uses this to scroll the logged meal into view instead.
    expect(onClose).toHaveBeenCalledWith({ mealType: 'breakfast' });
  });

  it('Full hands the entries to the "Just added" strip', async () => {
    const onJustAdded = vi.fn();
    renderDescribable({ onJustAdded, date: TODAY });
    type('pancakes');
    logIt();

    await waitFor(() => expect(onJustAdded).toHaveBeenLastCalledWith({
      mealType: 'breakfast',
      date: TODAY,
      heard: null,
      items: [expect.objectContaining({ logId: 'log-1', name: 'Chocolate chip pancakes', calories: 880, mealType: 'breakfast', date: TODAY })],
    }));
  });

  it('does not close the sheet when an entry was skipped — there is something to read', async () => {
    describeMeal.mockResolvedValue({
      ok: 1, fail: 1, logIds: ['log-1'],
      logged: [logged()],
      skipped: [{ name: 'Beef flautas', reason: 'portion-insane' }],
      questions: [], totalCalories: 880
    });
    const onClose = vi.fn();
    renderDescribable({ onClose });
    type('pancakes and 41 beef flautas');
    logIt();

    await screen.findByText(/couldn’t work out “Beef flautas”/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close the sheet when nothing at all was logged, and keeps the words', async () => {
    describeMeal.mockResolvedValue({
      ok: 0, fail: 1, logIds: [],
      logged: [], skipped: [{ name: 'mystery', reason: 'no-match' }],
      questions: [], totalCalories: 0
    });
    const onClose = vi.fn();
    renderDescribable({ onClose });
    type('mystery food');
    logIt();

    await screen.findByText(/couldn’t work out “mystery”/i);
    expect(onClose).not.toHaveBeenCalled();
    expect(theBox()).toHaveValue('mystery food');
  });

  it('a 422 says how to fix it, in plain words, and keeps the words', async () => {
    const err = new Error('request failed');
    err.response = { status: 422, data: { success: false, error: { message: "I couldn't find any food in that", code: 'NOTHING_TO_LOG' } } };
    describeMeal.mockRejectedValue(err);

    renderDescribable();
    type('asdfgh');
    logIt();

    expect(await screen.findByText("I couldn’t find a food in that. Try naming the food, like “chicken soup”.")).toBeInTheDocument();
    expect(theBox()).toHaveValue('asdfgh');
  });

  it('a failure says to tap Log it again, keeps the words, and retries with the same key', async () => {
    describeMeal
      .mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 500'), { response: { status: 500, data: {} } }))
      .mockResolvedValue({ ok: 1, fail: 0, logIds: ['log-1'], logged: [logged()], skipped: [], questions: [] });
    renderDescribable();
    type('two eggs');
    logIt();

    expect(await screen.findByText("That didn’t go through. Tap Log it to try again.")).toBeInTheDocument();
    expect(theBox()).toHaveValue('two eggs');
    logIt();
    await waitFor(() => expect(describeMeal).toHaveBeenCalledTimes(2));
    expect(describeMeal.mock.calls[1][1].idempotencyKey).toBe(describeMeal.mock.calls[0][1].idempotencyKey);
  });

  it('with no describe, Log it stays off and nothing is described', async () => {
    // A surface may mount without the prop; the box must not grow a live
    // button that cannot do anything.
    renderBox();
    type('pancakes');
    expect(screen.getByTestId('log-it')).toBeDisabled();
    fireEvent.keyDown(theBox(), { key: 'Enter' });
    expect(describeMeal).not.toHaveBeenCalled();
  });
});

describe('thinking (Phase 1.3)', () => {
  it('the box goes read-only, Log it says "Working it out…", and after 8 s "Still working"', async () => {
    let finish;
    const onDescribe = vi.fn(() => new Promise((res) => { finish = res; }));
    suggest.mockResolvedValue([food('Egg')]);
    renderBox({ onDescribe, mealType: 'lunch', onMealTypeChange: vi.fn() });
    type('egg');
    await vi.advanceTimersByTimeAsync(200);
    await screen.findByText('Egg');
    logIt();

    expect(await screen.findByText('Working it out…')).toBeInTheDocument();
    expect(theBox()).toHaveAttribute('readonly');
    // Everything else that writes is off.
    expect(screen.getByRole('button', { name: /Add Egg/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Lunch' })).toHaveClass('Mui-disabled');
    expect(screen.queryByText("Still working — this one’s taking a moment.")).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
    expect(screen.getByText("Still working — this one’s taking a moment.")).toBeInTheDocument();
    await act(async () => { finish({ logged: [], skipped: [], logIds: [] }); });
  });
});

describe('offline: honest (Chef, 2026-10-16)', () => {
  it('Log it is off with "No signal — I can\'t log this yet. Your words are saved here." and the words stay', async () => {
    setOnline(false);
    const onDescribe = vi.fn();
    renderBox({ onDescribe });
    type('two eggs and toast');

    expect(screen.getByText("No signal — I can’t log this yet. Your words are saved here.")).toBeInTheDocument();
    expect(screen.getByTestId('log-it')).toBeDisabled();
    fireEvent.keyDown(theBox(), { key: 'Enter' });
    expect(onDescribe).not.toHaveBeenCalled();
    expect(theBox()).toHaveValue('two eggs and toast');

    // Back online: it works again, with the same words.
    setOnline(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(screen.getByTestId('log-it')).toBeEnabled();
  });
});

describe('Simple stays open on what landed (Chef, 2026-10-16)', () => {
  const twoThings = {
    ok: 2, fail: 0, logIds: ['soup', 'crk'],
    logged: [
      { logId: 'soup', name: 'Chicken soup, 1 bowl', calories: 220, loggedServings: 1, mealType: 'lunch', nutrition: { calories_per_serving: 220, protein_grams: 12, carbs_grams: 20, fat_grams: 8 } },
      { logId: 'crk', name: 'Crackers, ~6', calories: 130, loggedServings: 1, mealType: 'lunch', nutrition: { calories_per_serving: 130 } },
    ],
    skipped: [], questions: [], totalCalories: 350,
  };

  it('a result card: "Added to lunch", each item with its calories and Fix, Undo all and Done', async () => {
    const onClose = vi.fn();
    const onDescribe = vi.fn().mockResolvedValue(twoThings);
    renderBox({ onDescribe, onClose, mealType: 'lunch', onUndo: vi.fn() }, { simple: true });
    type('a bowl of chicken soup and some crackers');
    logIt();

    const card = await screen.findByTestId('result-card');
    expect(within(card).getByText('Added to lunch')).toBeInTheDocument();
    const rows = within(card).getAllByTestId('entry-row').map((r) => r.textContent);
    expect(rows).toEqual(['Chicken soup, 1 bowl220 calFix', 'Crackers, ~6130 calFix']);
    expect(within(card).getByRole('button', { name: /undo all/i })).toBeInTheDocument();
    // It did not close itself.
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(within(card).getByRole('button', { name: 'Done ✓' }));
    expect(onClose).toHaveBeenCalledWith({ mealType: 'lunch' });
    expect(screen.queryByTestId('result-card')).toBeNull();
  });

  it('Undo all takes both back and puts her words back in the box', async () => {
    const onUndo = vi.fn().mockResolvedValue({ deleted: ['soup', 'crk'], failed: [] });
    renderBox({ onDescribe: vi.fn().mockResolvedValue(twoThings), onUndo, mealType: 'lunch' }, { simple: true });
    type('a bowl of chicken soup and some crackers');
    logIt();

    fireEvent.click(await screen.findByRole('button', { name: /undo all/i }));
    await waitFor(() => expect(onUndo).toHaveBeenCalledWith(['soup', 'crk']));
    expect(await screen.findByText('Undone ✓')).toBeInTheDocument();
    expect(theBox()).toHaveValue('a bowl of chicken soup and some crackers');
  });

  it('Fix → a calorie number goes out through the C3 override', async () => {
    const onSetCalories = vi.fn().mockResolvedValue({ calories_per_serving: 300 });
    renderBox({ onDescribe: vi.fn().mockResolvedValue(twoThings), onSetCalories, mealType: 'lunch', date: TODAY }, { simple: true });
    type('a bowl of chicken soup and some crackers');
    logIt();

    fireEvent.click(await screen.findByRole('button', { name: 'Fix Chicken soup, 1 bowl' }));
    const sheet = await screen.findByTestId('fix-sheet');
    expect(within(sheet).getByRole('button', { name: 'About right' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /^Smaller · ~/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /^Bigger · ~/ })).toBeInTheDocument();
    fireEvent.change(within(sheet).getByLabelText('Calories'), { target: { value: '300' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSetCalories).toHaveBeenCalledWith('soup', twoThings.logged[0].nutrition, 1, 300));
    await waitFor(() => expect(screen.queryByTestId('fix-sheet')).toBeNull());
    expect(within(screen.getByTestId('result-card')).getAllByTestId('entry-row')[0]).toHaveTextContent('300 cal');
  });

  it('Fix → "It was actually…" describes the new words into the same meal and day, then removes the old one', async () => {
    const onDescribe = vi.fn()
      .mockResolvedValueOnce(twoThings)
      .mockResolvedValueOnce({ logged: [{ logId: 'tom', name: 'Tomato soup', calories: 180, loggedServings: 1, mealType: 'lunch', nutrition: { calories_per_serving: 180 } }], skipped: [], logIds: ['tom'] });
    const onUndo = vi.fn().mockResolvedValue({ deleted: ['soup'], failed: [] });
    renderBox({ onDescribe, onUndo, onSetCalories: vi.fn(), mealType: 'lunch', date: '2026-10-13' }, { simple: true });
    type('a bowl of chicken soup and some crackers');
    logIt();

    fireEvent.click(await screen.findByRole('button', { name: 'Fix Chicken soup, 1 bowl' }));
    const sheet = await screen.findByTestId('fix-sheet');
    fireEvent.change(within(sheet).getByLabelText('It was actually…'), { target: { value: 'tomato soup' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Log this instead' }));

    await waitFor(() => expect(onDescribe).toHaveBeenLastCalledWith('tomato soup', expect.objectContaining({ mealType: 'lunch', date: '2026-10-13' })));
    await waitFor(() => expect(onUndo).toHaveBeenCalledWith(['soup']));
    // New first, then the old one goes.
    expect(onDescribe.mock.invocationCallOrder[1]).toBeLessThan(onUndo.mock.invocationCallOrder[0]);
    const rows = within(screen.getByTestId('result-card')).getAllByTestId('entry-row').map((r) => r.textContent);
    expect(rows).toEqual(['Tomato soup180 calFix', 'Crackers, ~6130 calFix']);
  });

  it('the result names the day when it isn\'t today', async () => {
    renderBox({ onDescribe: vi.fn().mockResolvedValue(twoThings), mealType: 'lunch', date: '2026-10-13' }, { simple: true });
    type('soup');
    logIt();
    // L22: on a backfilled sheet, days are weekdays — the title says
    // "Tuesday's lunch (yesterday)", and so does everything under it.
    expect(await screen.findByText("Added to Tuesday’s lunch")).toBeInTheDocument();
  });
});

describe('day words ask first (Phase 3.17)', () => {
  const onDescribe = vi.fn();
  beforeEach(() => {
    onDescribe.mockReset().mockResolvedValue({ ok: 1, logged: [{ logId: 'x', name: 'Fried chicken', calories: 600, mealType: 'dinner' }], skipped: [], logIds: ['x'] });
  });

  it('"last night" on today\'s sheet asks "Log this to yesterday?" — Yes sends yesterday', async () => {
    renderBox({ onDescribe, mealType: 'dinner', date: TODAY });
    type('fried chicken and fries last night');
    logIt();

    const chip = await screen.findByTestId('day-confirm');
    expect(chip).toHaveTextContent('Log this to yesterday?');
    expect(onDescribe).not.toHaveBeenCalled();
    fireEvent.click(within(chip).getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(onDescribe).toHaveBeenCalledWith('fried chicken and fries last night', expect.objectContaining({ date: '2026-10-13' })));
  });

  it('"No, today" sends today', async () => {
    renderBox({ onDescribe, mealType: 'dinner', date: TODAY });
    type('fried chicken yesterday');
    logIt();
    fireEvent.click(within(await screen.findByTestId('day-confirm')).getByRole('button', { name: 'No, today' }));
    await waitFor(() => expect(onDescribe).toHaveBeenCalledWith('fried chicken yesterday', expect.objectContaining({ date: TODAY })));
  });

  it('a weekday with "on" or "last" is a day; a bare one ("taco tuesday") is not', async () => {
    renderBox({ onDescribe, mealType: 'dinner', date: TODAY });
    type('tacos on monday');
    logIt();
    expect(await screen.findByTestId('day-confirm')).toHaveTextContent('Log this to Monday?');

    type('taco tuesday');
    logIt();
    await waitFor(() => expect(onDescribe).toHaveBeenCalledWith('taco tuesday', expect.objectContaining({ date: TODAY })));
  });

  it('no question when the sheet is already on that day', async () => {
    renderBox({ onDescribe, mealType: 'dinner', date: '2026-10-13' });
    type('fried chicken last night');
    logIt();
    await waitFor(() => expect(onDescribe).toHaveBeenCalledWith('fried chicken last night', expect.objectContaining({ date: '2026-10-13' })));
    expect(screen.queryByTestId('day-confirm')).toBeNull();
  });

  it('a day the server heard and we did not ask about is offered as a move', async () => {
    onDescribe.mockResolvedValue({
      ok: 1, logged: [{ logId: 'x', name: 'Pizza', calories: 600, mealType: 'dinner' }], skipped: [], logIds: ['x'],
      dayHint: 'yesterday', dayWords: ['the night before'],
    });
    const onUpdateLog = vi.fn().mockResolvedValue(true);
    renderBox({ onDescribe, onUpdateLog, mealType: 'dinner', date: TODAY });
    type('pizza');
    logIt();

    const move = await screen.findByRole('button', { name: 'Move it to yesterday' });
    fireEvent.click(move);
    await waitFor(() => expect(onUpdateLog).toHaveBeenCalledWith('x', { log_date: '2026-10-13' }));
    expect(await screen.findByText("Added to yesterday’s dinner")).toBeInTheDocument();
  });
});

/**
 * The one question (THE_DESCRIBE_AND_LOG_PLAN.md §3.8). It arrives AFTER the
 * food is written, never blocks it, and costs nothing to ignore.
 */
describe('the portion question', () => {
  const describeMeal = vi.fn();
  const adjust = vi.fn();

  const withQuestion = (over = {}) => ({
    ok: 1, fail: 0, logIds: ['log-n'],
    logged: [{
      logId: 'log-n',
      name: 'Nachos with beef and cheese',
      servings: 1,
      loggedServings: 1,
      calories: 1150,
      nutrition: { calories_per_serving: 1150, protein_grams: 40, carbs_grams: 100, fat_grams: 60 }
    }],
    skipped: [],
    questions: [{ logId: 'log-n', name: 'Nachos with beef and cheese', spread: 800, low: 400, high: 1200, logged: 1150 }],
    totalCalories: 1150,
    ...over
  });

  const renderBox2 = (props = {}) => renderBox({ onDescribe: describeMeal, onAdjustCalories: adjust, ...props });

  const logItNow = async () => {
    type('a dozen nachos with beef and cheese');
    logIt();
  };

  beforeEach(() => {
    describeMeal.mockReset();
    adjust.mockReset().mockResolvedValue(true);
    describeMeal.mockResolvedValue(withQuestion());
  });

  it('asks only after the food is already logged', async () => {
    renderBox2();
    type('nachos');
    await vi.advanceTimersByTimeAsync(600);

    // Nothing is asked while he is still typing — it must never be a gate.
    expect(screen.queryByText(/how big was/i)).toBeNull();

    logIt();
    expect(await screen.findByText(/how big was the nachos with beef and cheese/i)).toBeInTheDocument();
  });

  it('does not close the sheet while a portion question is pending', async () => {
    const onClose = vi.fn();
    renderBox2({ onClose });
    await logItNow();

    await screen.findByText(/how big was the nachos with beef and cheese/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers the model’s own range rather than a vague bigger/smaller', async () => {
    renderBox2();
    await logItNow();

    expect(await screen.findByRole('button', { name: /smaller · ~400/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bigger · ~1,200/i })).toBeInTheDocument();
    expect(screen.getByText(/logged at 1,150 cal/i)).toBeInTheDocument();
  });

  it('its buttons are big enough to hit: 15px words (Phase 1.7)', async () => {
    renderBox2();
    await logItNow();
    const smaller = await screen.findByRole('button', { name: /smaller · ~400/i });
    expect(getComputedStyle(smaller).fontSize).toBe('0.9375rem');
  });

  it('re-scales the written log when answered', async () => {
    renderBox2();
    await logItNow();

    fireEvent.click(await screen.findByRole('button', { name: /smaller · ~400/i }));
    await waitFor(() => expect(adjust).toHaveBeenCalledWith(
      'log-n',
      expect.objectContaining({ calories_per_serving: 1150 }),
      1,
      400
    ));
  });

  it('goes away when he says it was about right, and changes nothing', async () => {
    renderBox2();
    await logItNow();

    fireEvent.click(await screen.findByRole('button', { name: /that’s about right/i }));
    await waitFor(() => expect(screen.queryByText(/how big was/i)).toBeNull());
    expect(adjust).not.toHaveBeenCalled();
  });

  it('asks nothing when the backend judged it not worth a tap', async () => {
    describeMeal.mockResolvedValue(withQuestion({ questions: [] }));
    renderBox2();
    await logItNow();

    await waitFor(() => expect(describeMeal).toHaveBeenCalled());
    await waitFor(() => expect(theBox()).toHaveValue(''));
    expect(screen.queryByText(/how big was/i)).toBeNull();
  });

  it('asks nothing when the range is missing, rather than rendering an empty choice', async () => {
    describeMeal.mockResolvedValue(withQuestion({
      questions: [{ logId: 'log-n', name: 'Nachos', spread: 800, low: null, high: null, logged: 1150 }]
    }));
    renderBox2();
    await logItNow();

    await screen.findByTestId('result-card');
    expect(screen.queryByText(/how big was/i)).toBeNull();
  });
});

/**
 * The idle list, folded where it would bury the page. Folding applies to the
 * IDLE list only; the moment there is a query, results are what was asked for.
 */
describe('the idle list is folded where it would bury the page', () => {
  const mine = [food('Greek yogurt'), food('Rye toast'), food('Cold brew')];

  it('hides your own foods behind the heading, with a count', async () => {
    suggest.mockResolvedValue(mine);
    renderBox({ collapseIdleList: true });
    await vi.advanceTimersByTimeAsync(200);

    expect(await screen.findByText('Your foods')).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.queryByText('Greek yogurt')).not.toBeInTheDocument();
  });

  it('opens on a tap and closes again', async () => {
    suggest.mockResolvedValue(mine);
    renderBox({ collapseIdleList: true });
    await vi.advanceTimersByTimeAsync(200);

    const toggle = await screen.findByRole('button', { expanded: false });
    fireEvent.click(toggle);
    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { expanded: true }));
    await waitFor(() => expect(screen.queryByText('Greek yogurt')).not.toBeInTheDocument());
  });

  it('NEVER folds a name you searched for', async () => {
    suggest.mockResolvedValue([food('Pancakes')]);
    renderBox({ collapseIdleList: true });
    type('pancakes');
    await vi.advanceTimersByTimeAsync(600);

    expect(await screen.findByText('Pancakes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { expanded: false })).not.toBeInTheDocument();
  });

  it('leaves the list open where nothing is underneath it', async () => {
    suggest.mockResolvedValue(mine);
    renderBox();
    await vi.advanceTimersByTimeAsync(200);

    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();
  });

  it('shows no heading with nothing behind it — just the box', async () => {
    suggest.mockResolvedValue([]);
    renderBox({ collapseIdleList: true });
    await vi.advanceTimersByTimeAsync(200);

    expect(screen.getByText(/tell a friend/)).toBeInTheDocument();
    expect(screen.queryByText('Your foods')).not.toBeInTheDocument();
  });
});

/**
 * REVIEW_2026-10, the food-box bugs Heather actually hits.
 */
const axiosError = (status) => Object.assign(new Error(`Request failed with status code ${status}`), {
  isAxiosError: true,
  response: { status, data: {} }
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('B6: errors in plain words', () => {
  it('a 502 from the food databases says the app is restarting, not the status code', async () => {
    search.mockRejectedValue(axiosError(502));
    renderBox();
    type('pancakes');
    await vi.advanceTimersByTimeAsync(600);

    expect(await screen.findByText(/FitnessGeek is restarting/i)).toBeInTheDocument();
    expect(screen.queryByText(/status code/i)).toBeNull();
  });

  it('a 502 on describe says the same, and to tap Log it again', async () => {
    const onDescribe = vi.fn().mockRejectedValue(axiosError(502));
    renderBox({ onDescribe });
    type('two eggs');
    logIt();

    expect(await screen.findByText("FitnessGeek is restarting. That didn’t go through. Tap Log it to try again.")).toBeInTheDocument();
    expect(screen.queryByText(/status code/i)).toBeNull();
  });

  it('a failed tap-to-log never shows raw transport text', async () => {
    const onLogItems = vi.fn().mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
    suggest.mockResolvedValue([food('Egg')]);
    renderBox({ onLogItems });
    type('egg');
    await vi.advanceTimersByTimeAsync(200);
    fireEvent.click(await screen.findByText('Egg'));

    expect(await screen.findByText(/No signal right now/i)).toBeInTheDocument();
    expect(screen.queryByText('Network Error')).toBeNull();
  });
});

describe('B7: one tap, one log', () => {
  it('a second tap while the first is in flight does not log it again', async () => {
    const pending = deferred();
    const onLogItems = vi.fn(() => pending.promise);
    suggest.mockResolvedValue([food('Egg')]);
    renderBox({ onLogItems });
    type('egg');
    await vi.advanceTimersByTimeAsync(200);

    const row = await screen.findByText('Egg');
    fireEvent.click(row);
    fireEvent.click(row);
    // The tapped row says so at once.
    expect(await screen.findByText('Adding…')).toBeInTheDocument();
    expect(onLogItems).toHaveBeenCalledTimes(1);

    await act(async () => { pending.resolve({ ok: 1, fail: 0, logIds: ['l1'] }); });
    await waitFor(() => expect(screen.queryByText('Adding…')).toBeNull());
  });

  it('describe waits while a tapped row is still logging', async () => {
    const pending = deferred();
    const onLogItems = vi.fn(() => pending.promise);
    const onDescribe = vi.fn().mockResolvedValue({ logged: [], skipped: [], logIds: [] });
    suggest.mockResolvedValue([food('Egg')]);
    renderBox({ onLogItems, onDescribe });
    type('egg');
    await vi.advanceTimersByTimeAsync(600);

    fireEvent.click(await screen.findByText('Egg'));
    logIt();
    fireEvent.keyDown(theBox(), { key: 'Enter' });
    expect(onDescribe).not.toHaveBeenCalled();
    await act(async () => { pending.resolve({ ok: 1, fail: 0, logIds: ['l1'] }); });
  });

  it('two presses of Log it send one describe', async () => {
    const pending = deferred();
    const onDescribe = vi.fn(() => pending.promise);
    renderBox({ onDescribe });
    type('two eggs');
    logIt();
    fireEvent.keyDown(theBox(), { key: 'Enter' });
    logIt();
    expect(onDescribe).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ logged: [], skipped: [], logIds: [] }); });
  });
});

describe('B8: undo says what happened', () => {
  const tapToLog = async (onLogItems, name = 'Egg') => {
    fireEvent.click(await screen.findByText(name));
    await waitFor(() => expect(onLogItems).toHaveBeenCalled());
  };

  it('the toast changes to "Undone ✓"', async () => {
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['l1'] });
    const onUndo = vi.fn().mockResolvedValue({ deleted: ['l1'], failed: [] });
    suggest.mockResolvedValue([food('Egg')]);
    renderBox({ onLogItems, onUndo });
    type('egg');
    await vi.advanceTimersByTimeAsync(200);
    await tapToLog(onLogItems);

    fireEvent.click(await screen.findByRole('button', { name: /^undo$/i }));
    expect(await screen.findByText('Undone ✓')).toBeInTheDocument();
    expect(screen.queryByText(/Added to snacks/)).toBeNull();
  });

  it('a failed undo says so, and Try again retries only what failed', async () => {
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['m1', 'm2'], perItem: [['m1', 'm2']] });
    const onUndo = vi.fn()
      .mockResolvedValueOnce({ deleted: ['m1'], failed: ['m2'] })
      .mockResolvedValueOnce({ deleted: ['m2'], failed: [] });
    suggest.mockResolvedValue([food('Taco night', { type: 'meal' })]);
    renderBox({ onLogItems, onUndo });
    type('taco');
    await vi.advanceTimersByTimeAsync(200);
    await tapToLog(onLogItems, 'Taco night');

    fireEvent.click(await screen.findByRole('button', { name: /^undo$/i }));
    expect(await screen.findByText("Couldn’t undo — try again")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(onUndo).toHaveBeenLastCalledWith(['m2']));
    expect(await screen.findByText('Undone ✓')).toBeInTheDocument();
  });

  it('a thrown undo is a failed undo, not a silent one', async () => {
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['l1'] });
    const onUndo = vi.fn().mockRejectedValue(new Error('Network Error'));
    suggest.mockResolvedValue([food('Egg')]);
    renderBox({ onLogItems, onUndo });
    type('egg');
    await vi.advanceTimersByTimeAsync(200);
    await tapToLog(onLogItems);

    fireEvent.click(await screen.findByRole('button', { name: /^undo$/i }));
    expect(await screen.findByText("Couldn’t undo — try again")).toBeInTheDocument();
  });

  it('the ribbon keeps a row whose delete failed', async () => {
    let n = 0;
    const onLogItems = vi.fn(async () => { n += 1; return { ok: 1, fail: 0, logIds: [`l${n}`] }; });
    const onUndo = vi.fn().mockResolvedValue({ deleted: [], failed: ['l3'] });
    suggest.mockResolvedValue([food('Egg')]);
    renderBox({ onLogItems, onUndo });
    type('egg');
    await vi.advanceTimersByTimeAsync(200);
    for (let i = 1; i <= 3; i += 1) {
      fireEvent.click(await screen.findByText('Egg'));
      await waitFor(() => expect(onLogItems).toHaveBeenCalledTimes(i));
      await waitFor(() => expect(screen.queryByText('Adding…')).toBeNull());
    }
    // No onUpdateLog here, so each tap is its own entry.
    expect(await screen.findByText('3 added to snacks')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /undo last/i }));
    expect(await screen.findByText("Couldn’t undo — try again")).toBeInTheDocument();
    expect(screen.getByText('3 added to snacks')).toBeInTheDocument();
  });

  it('the undo toast stays up for ten seconds, not four', async () => {
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['l1'] });
    suggest.mockResolvedValue([food('Egg')]);
    renderBox({ onLogItems, onUndo: vi.fn() });
    type('egg');
    await vi.advanceTimersByTimeAsync(200);
    await tapToLog(onLogItems);
    await screen.findByRole('button', { name: /^undo$/i });

    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(screen.getByRole('button', { name: /^undo$/i })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.queryByRole('button', { name: /^undo$/i })).toBeNull();
  });
});

describe('C2: one Idempotency-Key per press', () => {
  it('a retry of the same words keeps its key; new words get a new one', async () => {
    const onDescribe = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' }))
      .mockResolvedValue({ logged: [], skipped: [{ name: 'x' }], logIds: [] });
    renderBox({ onDescribe });
    type('two eggs');

    logIt();
    await screen.findByText(/took too long/i);
    logIt();
    await waitFor(() => expect(onDescribe).toHaveBeenCalledTimes(2));
    const first = onDescribe.mock.calls[0][1].idempotencyKey;
    expect(first).toEqual(expect.any(String));
    expect(onDescribe.mock.calls[1][1].idempotencyKey).toBe(first);

    type('three eggs');
    logIt();
    await waitFor(() => expect(onDescribe).toHaveBeenCalledTimes(3));
    expect(onDescribe.mock.calls[2][1].idempotencyKey).not.toBe(first);
  });
});

describe('stale deep results', () => {
  it('a search still running when the box is cleared never lands', async () => {
    const pending = deferred();
    search.mockImplementation(() => pending.promise);
    renderBox();
    type('pancakes');
    await vi.advanceTimersByTimeAsync(500);
    expect(search).toHaveBeenCalledTimes(1);

    type('');
    await vi.advanceTimersByTimeAsync(200);
    await act(async () => { pending.resolve([food('Pancakes, buttermilk')]); });
    await vi.advanceTimersByTimeAsync(50);
    expect(screen.queryByText('Pancakes, buttermilk')).toBeNull();
  });
});

describe('the portion answer', () => {
  it('does not say "Updated" when nothing was updated', async () => {
    const onDescribe = vi.fn().mockResolvedValue({
      ok: 1, fail: 0, logIds: ['log-n'],
      logged: [{ logId: 'log-n', name: 'Nachos', servings: 1, loggedServings: 1, calories: 1150, nutrition: { calories_per_serving: 1150 } }],
      skipped: [],
      questions: [{ logId: 'log-n', name: 'Nachos', spread: 800, low: 400, high: 1200, logged: 1150 }],
      totalCalories: 1150
    });
    const onAdjustCalories = vi.fn().mockResolvedValue(false);
    renderBox({ onDescribe, onAdjustCalories });
    type('nachos');
    logIt();
    fireEvent.click(await screen.findByRole('button', { name: /smaller · ~400/i }));

    await waitFor(() => expect(onAdjustCalories).toHaveBeenCalled());
    expect(await screen.findByText('Couldn’t update that. Try again.')).toBeInTheDocument();
    expect(screen.queryByText(/Updated to 400 cal/)).toBeNull();
  });
});

// ── UX review 2026-10-17, wave A ───────────────────────────────────────

describe('L2: her habitual second tap is a second serving, not a third egg', () => {
  const egg = () => food('Egg', { nutrition: { calories_per_serving: 72 } });

  it('tap, tap → one entry with 2 servings; the row counts and offers the next number', async () => {
    // REVIEW_2026-10 §2a: she taps "Egg" twice, a minute apart, for two eggs.
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['egg-1'], perItem: [['egg-1']] });
    const onUpdateLog = vi.fn().mockResolvedValue(true);
    const onUndo = vi.fn().mockResolvedValue({ deleted: ['egg-1'], failed: [] });
    suggest.mockResolvedValue([egg()]);
    renderBox({ onLogItems, onUpdateLog, onUndo, mealType: 'breakfast' });
    type('egg');
    await vi.advanceTimersByTimeAsync(200);

    fireEvent.click(await screen.findByText('Egg'));
    await waitFor(() => expect(onLogItems).toHaveBeenCalledTimes(1));
    await screen.findByText(/Added ✓/);
    fireEvent.click(screen.getByText('Egg'));

    await waitFor(() => expect(onUpdateLog).toHaveBeenCalledWith('egg-1', { servings: 2 }));
    expect(onLogItems).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/2 added ✓/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make it 3 Egg' })).toBeInTheDocument();
    // L4: the toast says the amount.
    expect(await screen.findByText('Added to breakfast ✓ · Egg ×2')).toBeInTheDocument();
    // The ribbon is one entry, not two.
    expect(screen.getByText('1 added to breakfast')).toBeInTheDocument();

    // Undo takes back the whole entry.
    const toast = screen.getByText('Added to breakfast ✓ · Egg ×2').closest('.MuiSnackbarContent-root, [role="alert"]') || document.body;
    fireEvent.click(within(toast).getAllByRole('button', { name: /^undo$/i }).pop());
    await waitFor(() => expect(onUndo).toHaveBeenCalledWith(['egg-1']));
  });

  it('without a way to edit an entry, a second tap still logs one more (never nothing)', async () => {
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['egg-1'], perItem: [['egg-1']] });
    suggest.mockResolvedValue([egg()]);
    renderBox({ onLogItems });
    type('egg');
    await vi.advanceTimersByTimeAsync(200);
    fireEvent.click(await screen.findByText('Egg'));
    await waitFor(() => expect(onLogItems).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Adding…')).toBeNull());
    fireEvent.click(screen.getByText('Egg'));
    await waitFor(() => expect(onLogItems).toHaveBeenCalledTimes(2));
  });

  it('an Again chip counts the same way: "Added ✓ · Make it 2", and a second tap makes it 2 (L14)', async () => {
    recent.logs = ['2026-10-12', '2026-10-13'].map((day, i) => ({
      id: `e${i}`, meal_type: 'breakfast', servings: 1, log_date: `${day}T00:00:00.000Z`,
      nutrition: { calories_per_serving: 72 }, food_item_id: { id: 'egg', name: 'Egg' },
    }));
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['egg-9'], perItem: [['egg-9']] });
    const onUpdateLog = vi.fn().mockResolvedValue(true);
    renderBox({ onLogItems, onUpdateLog, mealType: 'breakfast', showQuickPicks: true, date: TODAY });

    fireEvent.click(await screen.findByRole('button', { name: 'Add Egg to breakfast again' }));
    await waitFor(() => expect(onLogItems).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Egg · Added ✓')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make it 2 Egg' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add another Egg to breakfast' }));
    await waitFor(() => expect(onUpdateLog).toHaveBeenCalledWith('egg-9', { servings: 2 }));
    expect(onLogItems).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Egg · 2 added ✓')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Make it 3 Egg' }));
    await waitFor(() => expect(onUpdateLog).toHaveBeenLastCalledWith('egg-9', { servings: 3 }));
  });

  it('a chip that re-logs two says so ("Toast ×2")', async () => {
    recent.logs = ['2026-10-12', '2026-10-13'].map((day, i) => ({
      id: `t${i}`, meal_type: 'breakfast', servings: 2, log_date: `${day}T00:00:00.000Z`,
      nutrition: { calories_per_serving: 80 }, food_item_id: { id: 'toast', name: 'Toast' },
    }));
    renderBox({ mealType: 'breakfast', showQuickPicks: true, date: TODAY });
    expect(await screen.findByText('Toast ×2')).toBeInTheDocument();
  });
});

describe('L10 + L11: the sitting shows from the first item, with Done', () => {
  it('"1 added to lunch" and Done after one tap; Done closes; there is no Undo all', async () => {
    const onClose = vi.fn();
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['f1'], perItem: [['f1']] });
    suggest.mockResolvedValue([food('Fage', { nutrition: { calories_per_serving: 190 } })]);
    renderBox({ onLogItems, onClose, onUndo: vi.fn(), mealType: 'lunch' });
    type('fage');
    await vi.advanceTimersByTimeAsync(200);
    fireEvent.click(await screen.findByText('Fage'));

    const ribbon = await screen.findByTestId('session-ribbon');
    expect(within(ribbon).getByText('1 added to lunch')).toBeInTheDocument();
    expect(within(ribbon).queryByRole('button', { name: /undo all/i })).toBeNull();
    expect(within(ribbon).getByRole('button', { name: /undo last/i })).toBeInTheDocument();
    fireEvent.click(within(ribbon).getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledWith({ mealType: 'lunch' });
  });
});

describe('L12: with a "Just added" strip, no toast sits on top of it', () => {
  const pancakes = {
    ok: 1, fail: 0, logIds: ['log-1'], skipped: [], questions: [], totalCalories: 880,
    logged: [{ logId: 'log-1', name: 'Chocolate chip pancakes', loggedServings: 1, mealType: 'breakfast', calories: 880, nutrition: { calories_per_serving: 880 } }],
  };

  it('Full with a strip: the strip gets the entries, and there is no toast or Undo', async () => {
    const onJustAdded = vi.fn();
    renderBox({ onDescribe: vi.fn().mockResolvedValue(pancakes), onJustAdded, onUndo: vi.fn(), onClose: vi.fn() });
    type('pancakes');
    logIt();
    await waitFor(() => expect(onJustAdded).toHaveBeenLastCalledWith(expect.objectContaining({ mealType: 'breakfast' })));
    await vi.advanceTimersByTimeAsync(50);
    expect(screen.queryByText(/Added to breakfast ✓/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^undo$/i })).toBeNull();
  });

  it('with no strip to show it, the toast still says what landed, with Undo', async () => {
    renderBox({ onDescribe: vi.fn().mockResolvedValue(pancakes), onUndo: vi.fn(), onClose: vi.fn() });
    type('pancakes');
    logIt();
    expect(await screen.findByText('Added to breakfast ✓ · Chocolate chip pancakes · 880 cal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^undo$/i })).toBeInTheDocument();
  });
});

describe('L4 + L6: the result card says amounts, and the meal per row when they differ', () => {
  it('"Pancakes ×2" when two servings were written', async () => {
    const onDescribe = vi.fn().mockResolvedValue({
      ok: 1, fail: 0, logIds: ['p'], skipped: [], questions: [], totalCalories: 400,
      logged: [{ logId: 'p', name: 'Pancakes', loggedServings: 2, mealType: 'breakfast', calories: 400, nutrition: { calories_per_serving: 200 } }],
    });
    renderBox({ onDescribe, mealType: 'breakfast' }, { simple: true });
    type('two pancakes');
    logIt();
    const card = await screen.findByTestId('result-card');
    expect(within(card).getByText('Pancakes ×2')).toBeInTheDocument();
  });

  it('entries in two meals: each row names its meal, and the header names only the day', async () => {
    const onDescribe = vi.fn().mockResolvedValue({
      ok: 2, fail: 0, logIds: ['c', 'f'], skipped: [], questions: [], totalCalories: 700,
      logged: [
        { logId: 'c', name: 'Fried chicken', loggedServings: 1, mealType: 'lunch', calories: 400, nutrition: { calories_per_serving: 400 } },
        { logId: 'f', name: 'Fries', loggedServings: 1, mealType: 'dinner', calories: 300, nutrition: { calories_per_serving: 300 } },
      ],
    });
    renderBox({ onDescribe, mealType: 'lunch', date: TODAY }, { simple: true });
    type('fried chicken, fries tonight');
    logIt();
    const card = await screen.findByTestId('result-card');
    expect(within(card).getByText('Added to today')).toBeInTheDocument();
    expect(within(card).getAllByTestId('entry-meal').map((m) => m.textContent)).toEqual(['Lunch', 'Dinner']);
  });

  it('one meal: no per-row meal, the header names it', async () => {
    const onDescribe = vi.fn().mockResolvedValue({
      ok: 1, fail: 0, logIds: ['s'], skipped: [], questions: [], totalCalories: 220,
      logged: [{ logId: 's', name: 'Soup', loggedServings: 1, mealType: 'lunch', calories: 220, nutrition: { calories_per_serving: 220 } }],
    });
    renderBox({ onDescribe, mealType: 'lunch' }, { simple: true });
    type('a bowl of soup');
    logIt();
    const card = await screen.findByTestId('result-card');
    expect(within(card).getByText('Added to lunch')).toBeInTheDocument();
    expect(within(card).queryByTestId('entry-meal')).toBeNull();
  });
});

describe('L13 + A4 + L14: a result row has room for a long name', () => {
  const long = () => food('Fage Total 0% Greek Yogurt, Plain Nonfat', { brand: 'Fage', serving: { size: 170, unit: 'g' }, nutrition: { calories_per_serving: 190, protein_grams: 18, carbs_grams: 6, fat_grams: 0 } });

  it('the name wraps instead of cutting off, and "190 cal" sits in a 14px subtitle', async () => {
    suggest.mockResolvedValue([long()]);
    renderBox();
    type('fage');
    await vi.advanceTimersByTimeAsync(200);
    const name = await screen.findByText('Fage Total 0% Greek Yogurt, Plain Nonfat');
    expect(name).not.toHaveStyle({ whiteSpace: 'nowrap' });
    const subtitle = within(screen.getByTestId('food-row')).getByTestId('food-row-subtitle');
    expect(subtitle).toHaveTextContent(/Fage · .* · 190 cal/);
    expect(subtitle).toHaveStyle({ fontSize: '0.875rem' });
  });

  it('the amount button says "Amount"', async () => {
    suggest.mockResolvedValue([long()]);
    renderBox();
    type('fage');
    await vi.advanceTimersByTimeAsync(200);
    const button = await screen.findByRole('button', { name: /change the amount of fage/i });
    expect(button).toHaveTextContent('Amount');
  });
});

describe('L20: one primary at a time', () => {
  it('a short name: the rows lead, and Log it steps back to "Just log \'fage\'"', async () => {
    renderBox({ onDescribe: vi.fn() });
    type('fage');
    const button = screen.getByTestId('log-it');
    expect(button).toHaveTextContent("Just log 'fage'");
    expect(button.className).toMatch(/MuiButton-outlined/);
    expect(button.className).not.toMatch(/MuiButton-contained/);
  });

  it('a sentence: Log it is the filled primary', async () => {
    renderBox({ onDescribe: vi.fn() });
    type('two eggs and toast');
    const button = screen.getByTestId('log-it');
    expect(button).toHaveTextContent(/^Log it$/);
    expect(button.className).toMatch(/MuiButton-contained/);
  });
});

describe('L21: number words make a sentence', () => {
  it('"two eggs" folds the list and needs no deep search', async () => {
    suggest.mockResolvedValue([food('Egg')]);
    renderBox({ onDescribe: vi.fn() });
    type('two eggs');
    await vi.advanceTimersByTimeAsync(600);
    expect(search).not.toHaveBeenCalled();
    expect(screen.getByTestId('log-it')).toHaveTextContent(/^Log it$/);
  });
});

describe('L22: one way of naming days in a backfilled sheet', () => {
  it('on yesterday\'s sheet, "last Monday" asks about Monday and offers "No, Tuesday"', async () => {
    const onDescribe = vi.fn();
    renderBox({ onDescribe, date: '2026-10-13' });
    type('pizza last monday');
    logIt();
    expect(await screen.findByText('Log this to Monday?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No, Tuesday' })).toBeInTheDocument();
    expect(onDescribe).not.toHaveBeenCalled();
  });
});

describe('L7: "Same as Chef\'s dinner"', () => {
  it('copies the member\'s meal through the box\'s logger, with the standard toast and an Undo that removes the copies', async () => {
    household = [{ userId: 'chef-1', name: 'Chef', foods: ['Steak', 'Salad'], calories: 900, count: 2 }];
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['c1', 'c2'], perItem: [['c1', 'c2']] });
    const onUndo = vi.fn().mockResolvedValue({ deleted: ['c1', 'c2'], failed: [] });
    renderBox({ onLogItems, onUndo, mealType: 'dinner', showQuickPicks: true, date: TODAY });

    const pick = await screen.findByRole('button', { name: "Same as Chef’s dinner" });
    expect(pick).toHaveTextContent('Steak, Salad');
    fireEvent.click(pick);
    await waitFor(() => expect(onLogItems).toHaveBeenCalledWith(
      [expect.objectContaining({ type: 'household-meal', fromUserId: 'chef-1', fromDate: TODAY, fromMealType: 'dinner' })],
      'dinner'
    ));
    expect(await screen.findByText("Added to dinner ✓ · Chef’s dinner")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^undo$/i }));
    await waitFor(() => expect(onUndo).toHaveBeenCalledWith(['c1', 'c2']));
  });

  it('no member logged this meal → no pick', async () => {
    household = [];
    renderBox({ mealType: 'dinner', showQuickPicks: true, date: TODAY });
    await vi.advanceTimersByTimeAsync(50);
    expect(screen.queryByRole('button', { name: /same as chef/i })).toBeNull();
  });
});

describe('L24: "You’re signed out. Sign in again." comes with a Sign in button', () => {
  it('a signed-out describe shows Sign in, which goes to the suite sign-in and back here', async () => {
    const onDescribe = vi.fn().mockRejectedValue({ response: { status: 401 } });
    renderBox({ onDescribe });
    type('two eggs and toast');
    logIt();
    expect(await screen.findByText('You’re signed out. Sign in again.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(loginRedirect).toHaveBeenCalledWith('fitnessgeek', window.location.href);
  });

  it('a signed-out tap-to-log toast has a Sign in button too', async () => {
    const onLogItems = vi.fn().mockRejectedValue({ response: { status: 401 } });
    suggest.mockResolvedValue([food('Egg')]);
    renderBox({ onLogItems });
    type('egg');
    await vi.advanceTimersByTimeAsync(200);
    fireEvent.click(await screen.findByText('Egg'));
    expect(await screen.findByText('You’re signed out. Sign in again.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(loginRedirect).toHaveBeenCalled();
  });
});
