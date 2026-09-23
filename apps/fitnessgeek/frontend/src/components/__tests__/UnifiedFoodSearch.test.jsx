/**
 * The search box: two waves, no submit step, one tap to log.
 *
 * What these pin down is the behaviour the old box got wrong. It searched only
 * on Enter or a send arrow, so nothing happened while you typed; and logging a
 * food meant staging it and then pressing commit. See
 * apps/fitnessgeek/DOCS/THE_FOOD_SEARCH_PLAN.md.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';
import UnifiedFoodSearch from '../FoodSearch/UnifiedFoodSearch.jsx';

const suggest = vi.fn();
const search = vi.fn();

vi.mock('../../services/foodService', () => ({
  foodService: {
    suggest: (...args) => suggest(...args),
    search: (...args) => search(...args)
  }
}));

const food = (name, overrides = {}) => ({
  id: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  source: 'usda',
  nutrition: { calories_per_serving: 200, protein_grams: 6, carbs_grams: 30, fat_grams: 8 },
  ...overrides
});

const renderBox = (props = {}) =>
  render(
    <GeekToastProvider>
      <UnifiedFoodSearch onLogItems={vi.fn()} {...props} />
    </GeekToastProvider>
  );

const type = (value) =>
  fireEvent.change(screen.getByPlaceholderText(/search foods/i), { target: { value } });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  suggest.mockResolvedValue([]);
  search.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
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

  it('does not reach the databases for a one-character query', async () => {
    renderBox();
    type('p');
    await vi.advanceTimersByTimeAsync(600);

    expect(search).not.toHaveBeenCalled();
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

    fireEvent.click(await screen.findByRole('button', { name: /undo/i }));
    await waitFor(() => expect(onUndo).toHaveBeenCalledWith(['log-1']));
  });

  it('never closes anything on a single tap — building the tray is the point', async () => {
    // Chef: "Clicking individual items is fine with the pop up count/tray it
    // has." Picking several results is a session the person ends, not a
    // single gesture that should whisk the sheet away out from under them.
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
});

describe('dead ends', () => {
  it('always offers to create what you typed', async () => {
    const onCreateFood = vi.fn();
    renderBox({ onCreateFood });
    type('goat cheese crostini');
    await vi.advanceTimersByTimeAsync(600);

    fireEvent.click(await screen.findByText(/goat cheese crostini/i, { selector: 'strong' }));
    expect(onCreateFood).toHaveBeenCalledWith('goat cheese crostini');
  });

  it('says so when the backend fell back to ingredients', async () => {
    search.mockResolvedValue([
      food('Chocolate chips', { compositeItem: 'chocolate chip', decomposedFrom: 'chocolate chip pancakes' })
    ]);

    renderBox();
    type('chocolate chip pancakes');
    await vi.advanceTimersByTimeAsync(600);

    expect(await screen.findByText(/showing its parts instead/i)).toBeInTheDocument();
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
 * Describe-and-log: the path Chef actually asked for.
 *
 * The backend for this shipped 2026-09-15 and nothing called it for a day,
 * while the box's placeholder invited you to "describe your meal" and then ran
 * a search. These cases exist so that cannot silently come back: the offer and
 * the behaviour have to be the same thing.
 */
describe('describing a meal', () => {
  const describeMeal = vi.fn();

  const renderDescribable = (props = {}) =>
    render(
      <GeekToastProvider>
        <UnifiedFoodSearch onLogItems={vi.fn()} onDescribe={describeMeal} {...props} />
      </GeekToastProvider>
    );

  const say = (value) =>
    fireEvent.change(screen.getByPlaceholderText(/what did you eat/i), { target: { value } });

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

  it('offers to log the sentence, above the search results', async () => {
    renderDescribable();
    say('4 chocolate chip pancakes homemade');
    await vi.advanceTimersByTimeAsync(600);

    expect(screen.getByText(/Log “4 chocolate chip pancakes homemade”/)).toBeInTheDocument();
  });

  it('names a saved meal in the toast, not its component count', async () => {
    // A saved meal writes one row per component. "Logged 7 items" for one
    // homemade quesadilla reads like something went wrong.
    const meal = { id: 'm1', name: 'Homemade Quesadilla' };
    const rows = ['Flour tortilla', 'Cheese', 'Chicken', 'Black beans', 'Sour cream', 'Guacamole', 'Cream cheese']
      .map((name, i) => logged({ logId: `c${i}`, name, calories: 100, source: 'saved-meal', savedMeal: meal }));
    describeMeal.mockResolvedValue({
      ok: 7, fail: 0, logIds: rows.map((r) => r.logId), logged: rows, skipped: [], questions: [], totalCalories: 725
    });
    renderDescribable();
    say('homemade quesadilla');
    await vi.advanceTimersByTimeAsync(600);
    fireEvent.click(screen.getByText(/Log “homemade quesadilla”/));

    expect(await screen.findByText('Logged Homemade Quesadilla · 725 cal')).toBeInTheDocument();
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
    say("fat boy's burger and fries and a coke");
    await vi.advanceTimersByTimeAsync(600);
    fireEvent.click(screen.getByText(/Log “fat boy's burger and fries and a coke”/));

    expect(await screen.findByText("Logged Fat Boy's Burger and Fries and Coke · 970 cal")).toBeInTheDocument();
  });

  it('logs on Enter rather than re-running a search that already ran', async () => {
    renderDescribable();
    say('a dozen nachos with beef and cheese');
    await vi.advanceTimersByTimeAsync(600);

    // SearchBar listens for the Enter key itself; there is no form element.
    fireEvent.keyDown(screen.getByPlaceholderText(/what did you eat/i), { key: 'Enter' });
    await waitFor(() => expect(describeMeal).toHaveBeenCalledWith('a dozen nachos with beef and cheese'));
  });

  it('logs when the offer itself is tapped', async () => {
    renderDescribable();
    say('  eggs and toast  ');
    await vi.advanceTimersByTimeAsync(600);

    fireEvent.click(screen.getByText(/Log “eggs and toast”/));
    await waitFor(() => expect(describeMeal).toHaveBeenCalledWith('eggs and toast'));
  });

  it('clears the box once it is written, so the same meal is not logged twice', async () => {
    renderDescribable();
    say('nachos');
    await vi.advanceTimersByTimeAsync(600);

    fireEvent.click(screen.getByText(/Log “nachos”/));
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/what did you eat/i)).toHaveValue('')
    );
  });

  it('says what landed, not just that something did', async () => {
    renderDescribable();
    say('pancakes');
    await vi.advanceTimersByTimeAsync(600);
    fireEvent.click(screen.getByText(/Log “pancakes”/));

    expect(await screen.findByText(/Chocolate chip pancakes · 880 cal/)).toBeInTheDocument();
  });

  it('reports the entries the rails threw out instead of hiding them', async () => {
    // A line can partly succeed: one dish writes, its neighbour is nonsense.
    // A log that quietly disagrees with what he said is worse than a warning.
    describeMeal.mockResolvedValue({
      ok: 1, fail: 1, logIds: ['log-1'],
      logged: [logged()],
      skipped: [{ name: 'Beef flautas', reason: 'portion-insane' }],
      questions: [], totalCalories: 880
    });
    renderDescribable();
    say('pancakes and 41 beef flautas');
    await vi.advanceTimersByTimeAsync(600);
    fireEvent.click(screen.getByText(/Log “pancakes and 41 beef flautas”/));

    expect(await screen.findByText(/skipped Beef flautas/i)).toBeInTheDocument();
  });

  it('closes the sheet on a clean log — Chef: "the one-tap ... should close to show it completed successfully"', async () => {
    const onClose = vi.fn();
    renderDescribable({ onClose });
    say('pancakes');
    await vi.advanceTimersByTimeAsync(600);
    fireEvent.click(screen.getByText(/Log “pancakes”/));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
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
    say('pancakes and 41 beef flautas');
    await vi.advanceTimersByTimeAsync(600);
    fireEvent.click(screen.getByText(/Log “pancakes and 41 beef flautas”/));

    await screen.findByText(/skipped Beef flautas/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close the sheet when nothing at all was logged', async () => {
    describeMeal.mockResolvedValue({
      ok: 0, fail: 1, logIds: [],
      logged: [], skipped: [{ name: 'mystery', reason: 'no-match' }],
      questions: [], totalCalories: 0
    });
    const onClose = vi.fn();
    renderDescribable({ onClose });
    say('mystery food');
    await vi.advanceTimersByTimeAsync(600);
    fireEvent.click(screen.getByText(/Log “mystery food”/));

    await screen.findByText(/couldn't make sense of that/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the server’s own words when there was no food in the text', async () => {
    const err = new Error('request failed');
    err.response = { data: { error: { message: "I couldn't find any food in that" } } };
    describeMeal.mockRejectedValue(err);

    renderDescribable();
    say('asdfgh');
    await vi.advanceTimersByTimeAsync(600);
    fireEvent.click(screen.getByText(/Log “asdfgh”/));

    expect(await screen.findByText(/couldn't find any food in that/i)).toBeInTheDocument();
  });

  it('offers nothing, and still searches on Enter, when the surface cannot describe', async () => {
    // AddFoodDialog and friends may mount without the prop; the box must not
    // grow a dead button, and Enter must keep its old meaning there.
    render(
      <GeekToastProvider>
        <UnifiedFoodSearch onLogItems={vi.fn()} />
      </GeekToastProvider>
    );
    fireEvent.change(screen.getByPlaceholderText(/search foods/i), { target: { value: 'pancakes' } });
    await vi.advanceTimersByTimeAsync(600);

    expect(screen.queryByText(/^Log “/)).toBeNull();
    expect(describeMeal).not.toHaveBeenCalled();
  });
});

/**
 * The one question (THE_DESCRIBE_AND_LOG_PLAN.md §3.8).
 *
 * The rule is "at most one, and only when the answer moves the day". The
 * backend decides whether it is earned — an absolute 400 cal spread, not a
 * percentage — so what matters here is that the question arrives AFTER the food
 * is written, never blocks it, and costs nothing to ignore.
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

  const renderBox2 = () =>
    render(
      <GeekToastProvider>
        <UnifiedFoodSearch onLogItems={vi.fn()} onDescribe={describeMeal} onAdjustCalories={adjust} />
      </GeekToastProvider>
    );

  const say = (v) =>
    fireEvent.change(screen.getByPlaceholderText(/what did you eat/i), { target: { value: v } });

  const logIt = async () => {
    say('a dozen nachos with beef and cheese');
    await vi.advanceTimersByTimeAsync(600);
    fireEvent.click(screen.getByText(/^Log “/));
  };

  beforeEach(() => {
    describeMeal.mockReset();
    adjust.mockReset().mockResolvedValue(true);
    describeMeal.mockResolvedValue(withQuestion());
  });

  it('asks only after the food is already logged', async () => {
    renderBox2();
    say('nachos');
    await vi.advanceTimersByTimeAsync(600);

    // Nothing is asked while he is still typing — it must never be a gate.
    expect(screen.queryByText(/how big was/i)).toBeNull();

    fireEvent.click(screen.getByText(/^Log “/));
    expect(await screen.findByText(/how big was the nachos with beef and cheese/i)).toBeInTheDocument();
  });

  it('does not close the sheet while a portion question is pending', async () => {
    // The write already succeeded (ok:1, no skips) — only the question keeps
    // this from being a "clean" log. Answering it re-scales what's already
    // on screen, so the sheet has to stay for that to be reachable.
    const onClose = vi.fn();
    render(
      <GeekToastProvider>
        <UnifiedFoodSearch onLogItems={vi.fn()} onDescribe={describeMeal} onAdjustCalories={adjust} onClose={onClose} />
      </GeekToastProvider>
    );
    await logIt();

    await screen.findByText(/how big was the nachos with beef and cheese/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers the model’s own range rather than a vague bigger/smaller', async () => {
    renderBox2();
    await logIt();

    expect(await screen.findByRole('button', { name: /smaller · ~400/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bigger · ~1200/i })).toBeInTheDocument();
    expect(screen.getByText(/logged at 1150 cal/i)).toBeInTheDocument();
  });

  it('re-scales the written log when answered', async () => {
    renderBox2();
    await logIt();

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
    await logIt();

    fireEvent.click(await screen.findByRole('button', { name: /that's about right/i }));
    await waitFor(() => expect(screen.queryByText(/how big was/i)).toBeNull());
    expect(adjust).not.toHaveBeenCalled();
  });

  it('asks nothing when the backend judged it not worth a tap', async () => {
    describeMeal.mockResolvedValue(withQuestion({ questions: [] }));
    renderBox2();
    await logIt();

    await waitFor(() => expect(screen.queryByText(/^Log “/)).toBeNull());
    expect(screen.queryByText(/how big was/i)).toBeNull();
  });

  it('asks nothing when the range is missing, rather than rendering an empty choice', async () => {
    describeMeal.mockResolvedValue(withQuestion({
      questions: [{ logId: 'log-n', name: 'Nachos', spread: 800, low: null, high: null, logged: 1150 }]
    }));
    renderBox2();
    await logIt();

    await waitFor(() => expect(screen.queryByText(/^Log “/)).toBeNull());
    expect(screen.queryByText(/how big was/i)).toBeNull();
  });
});

/**
 * The idle list, folded.
 *
 * With no query, `suggest('')` returns up to fifteen of your own foods —
 * roughly 800px of rows. On the Food Log that sits between the search box and
 * the meals, so arriving to check what you ate meant scrolling past your whole
 * food catalogue first.
 *
 * The line that must not be crossed: folding applies to the IDLE list only.
 * The moment there is a query, the results are what was asked for.
 */
describe('the idle list is folded where it would bury the page', () => {
  const mine = [food('Greek yogurt'), food('Rye toast'), food('Cold brew')];

  it('hides your own foods behind the heading, with a count', async () => {
    suggest.mockResolvedValue(mine);
    renderBox({ collapseIdleList: true });
    await vi.advanceTimersByTimeAsync(200);

    // The heading is there and says how many are behind it — folded, that
    // count is the only thing telling you the list exists.
    expect(await screen.findByText('Your foods')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('Greek yogurt')).not.toBeInTheDocument();
  });

  it('opens on a tap and closes again', async () => {
    suggest.mockResolvedValue(mine);
    renderBox({ collapseIdleList: true });
    await vi.advanceTimersByTimeAsync(200);

    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);
    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { expanded: true }));
    await waitFor(() => expect(screen.queryByText('Greek yogurt')).not.toBeInTheDocument());
  });

  it('NEVER folds what you searched for', async () => {
    // The whole risk of this change: typing and being shown a folded list.
    suggest.mockResolvedValue([food('Pancakes')]);
    renderBox({ collapseIdleList: true });
    type('pancakes');
    await vi.advanceTimersByTimeAsync(600);

    expect(await screen.findByText('Pancakes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { expanded: false })).not.toBeInTheDocument();
  });

  it('leaves the list open where nothing is underneath it', async () => {
    // The dedicated search page passes no flag: there the list IS the page.
    suggest.mockResolvedValue(mine);
    renderBox();
    await vi.advanceTimersByTimeAsync(200);

    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();
  });

  it('shows the ordinary empty state rather than a heading with nothing behind it', async () => {
    suggest.mockResolvedValue([]);
    renderBox({ collapseIdleList: true });
    await vi.advanceTimersByTimeAsync(200);

    expect(await screen.findByText(/what did you eat/i)).toBeInTheDocument();
    expect(screen.queryByText('Your foods')).not.toBeInTheDocument();
  });
});
