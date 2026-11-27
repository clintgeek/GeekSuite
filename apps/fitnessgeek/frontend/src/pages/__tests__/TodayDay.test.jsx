/**
 * Today shows one day (DOCS/ONE_APP_PLAN.md §1): today unless a link says
 * otherwise, with previous, next and a way back.
 *
 *   - `?date=…&meal=…` opens that day and brings that meal into view;
 *     `/food-log?…` redirects here with its query; `?add=` opens the sheet;
 *   - another day reads that day's food, says so in words that never say
 *     "today", and drops today's check-ins and meds;
 *   - "today" follows the clock (a PWA resumed next morning, B3), but a day
 *     chosen on purpose stays;
 *   - a slow answer for a day no longer on screen is dropped (B19);
 *   - from md up the add box is on the page: no button, the box's meal
 *     follows the clock, and a backfilled day is named above it.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { foodLog, setViewport } from './todayHarness.js';

const TODAY = '2026-10-16'; // a Friday
const YESTERDAY = '2026-10-15';
const BY_DAY = {
  [TODAY]: [foodLog('t1', 'Greek yogurt', 'breakfast', 190)],
  [YESTERDAY]: [foodLog('y1', 'Leftover pizza', 'dinner', 600)],
};
let todayValue = TODAY;

vi.mock('../../services/fitnessGeekService.js', () => ({
  fitnessGeekService: {
    formatDate: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    getDailySummary: vi.fn(),
    getGarminDaily: vi.fn(() => Promise.resolve(null)),
    getLogsForDate: vi.fn(),
    deleteFoodLog: vi.fn(),
  },
}));
vi.mock('../../services/goalsService.js', () => ({
  goalsService: { getDerivedMacros: vi.fn(() => Promise.resolve({ data: { today: { target_calories: 2000 } } })) },
}));
vi.mock('../../services/weightService.js', () => ({
  weightService: { getWeightStats: vi.fn(() => Promise.resolve(null)), getWeightLogs: vi.fn(() => Promise.resolve({ data: [] })) },
}));
vi.mock('../../services/bpService.js', () => ({ bpService: { getBPLogs: vi.fn(() => Promise.resolve({ data: [] })) } }));
vi.mock('../../services/streakService.js', () => ({ streakService: { getLoginStreak: vi.fn(() => Promise.resolve(null)) } }));
vi.mock('../../services/settingsService.js', () => ({ settingsService: { getSettings: vi.fn(() => Promise.resolve({ data: {} })) } }));
vi.mock('../../services/bodyCompService.js', () => ({ bodyCompService: { getSummary: vi.fn(() => Promise.resolve(null)) } }));
vi.mock('../../services/medsService.js', () => ({
  medsService: {
    list: vi.fn(() => Promise.resolve([{ id: 'm1', display_name: 'Lisinopril', times_of_day: ['morning'] }])),
    getLogsByDate: vi.fn(() => Promise.resolve([])),
    log: vi.fn(),
  },
}));
const loggingFor = [];
vi.mock('../../hooks/useFoodLogging.js', () => ({
  useFoodLogging: ({ date }) => {
    loggingFor.push(date);
    return { logItems: vi.fn(), undoLogs: vi.fn(), describeMeal: vi.fn(), adjustLogCalories: vi.fn(), createFood: vi.fn() };
  },
}));
vi.mock('../../hooks/useToday.js', () => ({ useToday: () => todayValue, default: () => todayValue }));
vi.mock('../../components/Dashboard/AIInsightsCard.jsx', () => ({ default: () => <div data-testid="insights" /> }));
vi.mock('../../components/MyFoods/FoodEditDialog.jsx', () => ({ default: () => null }));
// The add sheet and the add box, reduced to what the page hands them.
vi.mock('../../components/FoodLog/AddFoodDialog.jsx', () => ({
  default: ({ open, mealType, date, onClose }) => (open ? (
    <div role="dialog" aria-label="Add">
      <span data-testid="sheet-meal">{mealType}</span>
      <span data-testid="sheet-date">{date}</span>
      <button type="button" onClick={() => onClose({ mealType })}>Done</button>
    </div>
  ) : null),
}));
vi.mock('../../components/FoodSearch', () => ({
  FoodComposer: ({ mealType, date, mode, onClose }) => (
    <div data-testid="composer">
      <span data-testid="box-meal">{mealType}</span>
      <span data-testid="box-date">{date}</span>
      <span data-testid="box-mode">{mode}</span>
      <button type="button" onClick={() => onClose({ mealType })}>finish-log</button>
    </div>
  ),
}));

const { fitnessGeekService } = await import('../../services/fitnessGeekService.js');
const { default: Today } = await import('../Today.jsx');
const { default: RedirectWithQuery } = await import('../../components/Layout/RedirectWithQuery.jsx');

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>Browser back</button>;
}

const page = (url = '/dashboard', history = null) => (
  <GeekToastProvider>
    <MemoryRouter initialEntries={history || [url]} initialIndex={history ? history.length - 1 : 0}>
      <Link to="/dashboard">Today tab</Link>
      <BackButton />
      <Routes>
        <Route path="/dashboard" element={<Today />} />
        <Route path="/food-log" element={<RedirectWithQuery to="/dashboard" />} />
      </Routes>
    </MemoryRouter>
  </GeekToastProvider>
);
const renderPage = (url) => render(page(url));
const title = () => screen.getByTestId('day-header-title').textContent;
const clickNav = async (name) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };

let scrolled;
let originalScroll;
let raf;

beforeEach(() => {
  todayValue = TODAY;
  loggingFor.length = 0;
  setViewport(false);
  try { window.localStorage.clear(); } catch { /* jsdom */ }
  fitnessGeekService.getLogsForDate.mockImplementation((day) => Promise.resolve(BY_DAY[day] || []));
  fitnessGeekService.getDailySummary.mockImplementation((day) => Promise.resolve({
    data: { totals: { calories: (BY_DAY[day] || []).reduce((n, l) => n + l.nutrition.calories_per_serving, 0) }, meals: {} },
  }));
  scrolled = [];
  originalScroll = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function record() { scrolled.push(this.id); };
  raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 1; });
});
afterEach(() => {
  Element.prototype.scrollIntoView = originalScroll;
  raf.mockRestore();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('today, by default', () => {
  it('greets, names the day in full, and reads and writes today', async () => {
    renderPage();
    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();
    expect(title()).toMatch(/^Good (morning|afternoon|evening)$/);
    expect(screen.getByTestId('day-header-date')).toHaveTextContent('Friday, October 16');
    expect(screen.queryByTestId('back-to-today')).toBeNull();
    expect(fitnessGeekService.getLogsForDate).toHaveBeenCalledWith(TODAY);
    expect(loggingFor[loggingFor.length - 1]).toBe(TODAY);
  });
});

describe('a link to a day and a meal', () => {
  it('opens on the linked day and scrolls to the linked meal, once its rows are in', async () => {
    renderPage(`/dashboard?date=${YESTERDAY}&meal=dinner`);
    expect(await screen.findByText('Leftover pizza')).toBeInTheDocument();
    expect(fitnessGeekService.getLogsForDate).toHaveBeenCalledWith(YESTERDAY);
    expect(fitnessGeekService.getLogsForDate).not.toHaveBeenCalledWith(TODAY);
    expect(title()).toBe('Yesterday');
    await waitFor(() => expect(scrolled).toEqual(['meal-card-dinner']));
  });

  it('/food-log?date=…&meal=… still lands: it redirects here with its query', async () => {
    renderPage(`/food-log?date=${YESTERDAY}&meal=dinner`);
    expect(await screen.findByText('Leftover pizza')).toBeInTheDocument();
    expect(title()).toBe('Yesterday');
    await waitFor(() => expect(scrolled).toEqual(['meal-card-dinner']));
  });

  it('ignores a malformed date and an unknown meal', async () => {
    renderPage('/dashboard?date=tomorrow&meal=brunch');
    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();
    expect(fitnessGeekService.getLogsForDate).toHaveBeenCalledWith(TODAY);
    expect(scrolled).toEqual([]);
  });

  it.each([['1', /^(breakfast|lunch|dinner|snack)$/], ['lunch', /^lunch$/]])('?add=%s opens the add sheet', async (add, meal) => {
    renderPage(`/dashboard?add=${add}`);
    expect(await screen.findByTestId('sheet-meal')).toHaveTextContent(meal);
    expect(screen.getByTestId('sheet-date')).toHaveTextContent(TODAY);
  });

  it('no ?add, no sheet', async () => {
    renderPage();
    await screen.findByText('Greek yogurt');
    expect(screen.queryByRole('dialog', { name: 'Add' })).toBeNull();
  });
});

describe('another day', () => {
  it('Previous reads and writes that day, and says so in words that never say "today"', async () => {
    renderPage();
    await screen.findByText('Greek yogurt');
    await clickNav('Previous day');
    expect(await screen.findByText('Leftover pizza')).toBeInTheDocument();
    expect(screen.queryByText('Greek yogurt')).toBeNull();
    expect(title()).toBe('Yesterday');
    expect(screen.getByTestId('day-header-date')).toHaveTextContent('Thursday, October 15');
    expect(loggingFor[loggingFor.length - 1]).toBe(YESTERDAY);
    expect(screen.getByTestId('calories-sentence')).toHaveTextContent('You had 1,400 calories left');
    expect(screen.getByRole('heading', { name: 'Calories for this day' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Meals' })).toBeInTheDocument();
    expect(screen.getByTestId('home-hero').textContent).not.toMatch(/today/i);
  });

  it('drops what is about today only: the check-ins and the meds; the numbers and notes stay', async () => {
    renderPage();
    expect(await screen.findByTestId('meds-checklist')).toBeInTheDocument();
    expect(screen.getByTestId('today-strip')).toBeInTheDocument();
    await clickNav('Previous day');
    await screen.findByText('Leftover pizza');
    expect(screen.queryByTestId('meds-checklist')).toBeNull();
    expect(screen.queryByTestId('today-strip')).toBeNull();
    expect(screen.getByTestId('your-numbers')).toBeInTheDocument();
    expect(screen.getByTestId('insights')).toBeInTheDocument();
  });

  it('"Change today\'s target" and the activity line are for today only', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('macros-details-toggle'));
    expect(await screen.findByTestId('day-target-editor')).toBeInTheDocument();
    await clickNav('Previous day');
    await screen.findByText('Leftover pizza');
    expect(screen.getByTestId('macro-strip')).toBeInTheDocument();
    expect(screen.queryByTestId('day-target-editor')).toBeNull();
    expect(screen.queryByTestId('activity-allowance')).toBeNull();
  });

  it('"Today" comes back, and Next goes on', async () => {
    renderPage();
    await screen.findByText('Greek yogurt');
    await clickNav('Previous day');
    await screen.findByText('Leftover pizza');
    const back = screen.getByTestId('back-to-today');
    expect(back).toHaveAccessibleName('Back to today');
    await act(async () => { fireEvent.click(back); });
    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();
    expect(title()).toMatch(/^Good /);

    await clickNav('Next day');
    await waitFor(() => expect(title()).toBe('Tomorrow'));
    expect(fitnessGeekService.getLogsForDate).toHaveBeenLastCalledWith('2026-10-17');
    expect(await screen.findByTestId('calories-sentence')).toHaveTextContent('You have 2,000 calories left');
  });

  it('two steps back names the date in words', async () => {
    renderPage();
    await screen.findByText('Greek yogurt');
    await clickNav('Previous day');
    await clickNav('Previous day');
    await waitFor(() => expect(title()).toBe('Wednesday, October 14'));
    expect(screen.queryByTestId('day-header-date')).toBeNull();
  });

  it('tapping the Today tab from another day comes back to today', async () => {
    renderPage();
    await screen.findByText('Greek yogurt');
    await clickNav('Previous day');
    await screen.findByText('Leftover pizza');
    await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Today tab' })); });
    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();
    expect(title()).toMatch(/^Good /);
  });

  it('Back does not move the day: it is how an open sheet closes', async () => {
    render(page(null, ['/dashboard', '/dashboard?from=sheet']));
    await screen.findByText('Greek yogurt');
    await clickNav('Previous day');
    await screen.findByText('Leftover pizza');
    await clickNav('Browser back');
    await act(async () => {});
    expect(title()).toBe('Yesterday');
    expect(screen.getByText('Leftover pizza')).toBeInTheDocument();
  });

  it('"What did you eat?" adds to the day on screen, on its meal', async () => {
    renderPage(`/dashboard?date=${YESTERDAY}&meal=dinner`);
    await screen.findByText('Leftover pizza');
    await act(async () => { fireEvent.click(screen.getByTestId('what-did-you-eat')); });
    expect(await screen.findByTestId('sheet-date')).toHaveTextContent(YESTERDAY);
    expect(screen.getByTestId('sheet-meal')).toHaveTextContent('dinner');
  });

  it('a meal\'s Add on another day adds to that day', async () => {
    renderPage(`/dashboard?date=${YESTERDAY}`);
    await screen.findByText('Leftover pizza');
    await clickNav('Add to lunch');
    expect(await screen.findByTestId('sheet-date')).toHaveTextContent(YESTERDAY);
    expect(screen.getByTestId('sheet-meal')).toHaveTextContent('lunch');
  });
});

describe('B3: the day on screen follows today', () => {
  it('moves to the new day when the app is resumed next morning', async () => {
    const view = renderPage();
    await screen.findByText('Greek yogurt');
    todayValue = '2026-10-17';
    view.rerender(page());
    await waitFor(() => expect(fitnessGeekService.getLogsForDate).toHaveBeenLastCalledWith('2026-10-17'));
    await waitFor(() => expect(screen.getByTestId('day-header-date')).toHaveTextContent('Saturday, October 17'));
    expect(title()).toMatch(/^Good /);
    expect(loggingFor[loggingFor.length - 1]).toBe('2026-10-17');
    // A new today asks Garmin about the new today.
    expect(fitnessGeekService.getGarminDaily).toHaveBeenLastCalledWith('2026-10-17');
  });

  it('leaves a day she chose on purpose alone', async () => {
    const view = renderPage('/dashboard?date=2026-10-14');
    await waitFor(() => expect(title()).toBe('Wednesday, October 14'));
    todayValue = '2026-10-17';
    view.rerender(page('/dashboard?date=2026-10-14'));
    await act(async () => {});
    expect(title()).toBe('Wednesday, October 14');
    expect(loggingFor[loggingFor.length - 1]).toBe('2026-10-14');
  });
});

describe('B19: only the newest read may write the page', () => {
  it('drops a late answer for a day that is no longer on screen', async () => {
    renderPage();
    await screen.findByText('Greek yogurt');
    let answerYesterday;
    fitnessGeekService.getLogsForDate.mockImplementation((day) => (
      day === YESTERDAY ? new Promise((resolve) => { answerYesterday = resolve; }) : Promise.resolve(BY_DAY[day] || [])
    ));
    await clickNav('Previous day');
    await act(async () => { fireEvent.click(screen.getByTestId('back-to-today')); });
    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();
    await act(async () => { answerYesterday(BY_DAY[YESTERDAY]); });
    expect(screen.queryByText('Leftover pizza')).toBeNull();
    expect(screen.getByText('Greek yogurt')).toBeInTheDocument();
  });

  it('while a day has not answered, it is drawn as loading — never as the day before it', async () => {
    renderPage();
    await screen.findByText('Greek yogurt');
    fitnessGeekService.getLogsForDate.mockImplementation(() => new Promise(() => {}));
    await clickNav('Previous day');
    expect(title()).toBe('Yesterday');
    expect(screen.queryByText('Greek yogurt')).toBeNull();
    expect(screen.queryByText('Nothing yet')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});

describe('from md up: two columns, and the add box on the page', () => {
  const at = (hour) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 16, hour, 0));
  };
  beforeEach(() => setViewport(true));

  it('the add box is on the page, so there is no "What did you eat?" button', async () => {
    renderPage();
    await screen.findByText('Greek yogurt');
    const box = screen.getByTestId('inline-add');
    expect(within(box).getByTestId('composer')).toBeInTheDocument();
    expect(within(box).getByTestId('box-mode')).toHaveTextContent('page');
    expect(within(box).getByTestId('box-date')).toHaveTextContent(TODAY);
    expect(screen.queryByTestId('what-did-you-eat')).toBeNull();
  });

  it('left: what is left, then the meals. Right: the box, check-ins, meds, numbers, notes', async () => {
    renderPage();
    const meds = await screen.findByTestId('meds-checklist');
    const order = [
      screen.getByTestId('home-hero'),
      screen.getByTestId('meal-cards'),
      screen.getByTestId('inline-add'),
      screen.getByTestId('today-strip'),
      meds,
      screen.getByTestId('your-numbers'),
      screen.getByTestId('insights'),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // Two columns: the meals sit in the card's column, the box in the other.
    const leftColumn = screen.getByTestId('home-hero').parentElement;
    expect(leftColumn.contains(screen.getByTestId('meal-cards'))).toBe(true);
    expect(leftColumn.contains(screen.getByTestId('inline-add'))).toBe(false);
  });

  it("the box's meal follows the clock, not a hardcoded snack: breakfast before 10am", async () => {
    at(8);
    renderPage();
    expect(await screen.findByTestId('box-meal')).toHaveTextContent('breakfast');
  });

  it("the box's meal follows the clock: dinner in the evening", async () => {
    at(18);
    renderPage();
    expect(await screen.findByTestId('box-meal')).toHaveTextContent('dinner');
  });

  it('on yesterday, the box names the day the way the sheet does', async () => {
    at(19);
    renderPage(`/dashboard?date=${YESTERDAY}`);
    expect(await screen.findByTestId('inline-add-day')).toHaveTextContent('Add to Thursday’s dinner (yesterday)');
    expect(screen.getByTestId('box-date')).toHaveTextContent(YESTERDAY);
  });

  it('on today, the box adds no day line', async () => {
    renderPage();
    await screen.findByTestId('composer');
    expect(screen.queryByTestId('inline-add-day')).toBeNull();
    expect(within(screen.getByTestId('inline-add')).getByRole('heading', { name: 'What did you eat?' })).toBeInTheDocument();
  });

  it('a finished log on the page drops the keyboard and brings its meal into view', async () => {
    at(18);
    renderPage();
    await screen.findByTestId('composer');
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    fireEvent.click(screen.getByText('finish-log'));
    expect(scrolled).toEqual(['meal-card-dinner']);
    expect(document.activeElement).not.toBe(input);
    input.remove();
  });

  it("a meal's Add still opens the sheet, set to that meal", async () => {
    renderPage();
    await screen.findByText('Greek yogurt');
    await clickNav('Add to snacks');
    expect(await screen.findByTestId('sheet-meal')).toHaveTextContent('snack');
  });
});
