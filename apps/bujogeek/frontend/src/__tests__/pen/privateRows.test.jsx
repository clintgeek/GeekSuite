/**
 * Private tasks on the row (context/PrivacyContext.jsx, components/pen/PenRow.jsx).
 *
 * Desktop (md+ and a fine pointer): the words, tags and note are NOT IN THE
 * DOM until revealed — the row is an eye-slash, a redaction bar and a button
 * called "Private task, hidden. Activate to show.". A click reveals that one
 * task; it hides again on its eye button, Escape, the window losing focus,
 * the page going hidden, or after 60 seconds. An open editor shows the words,
 * and blurs while the window is away.
 *
 * Phone: the words show, with a small eye-slash mark.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { createBuJoTheme } from '../../theme/theme';
import PenRow from '../../components/pen/PenRow';
import { PrivacyProvider, REVEAL_MS, HIDDEN_LABEL } from '../../context/PrivacyContext';
import { filterByTag } from '../../utils/penViews';

process.env.TZ = 'America/Chicago';

const SECRET = 'Fire Jane';
const NOTE = 'talk to legal first';
const TAG = 'hrJane';
const now = new Date(2026, 8, 29, 10, 0);
const privateTask = (over = {}) => ({
  id: 'p1', content: SECRET, note: NOTE, tags: [TAG], private: true, status: 'pending',
  priority: 1, dueDate: '2026-09-29T00:00:00.000Z', ...over,
});

// Desktop = md+ AND a fine pointer (and a hover). Phone = none of them.
let desktop = true;
const realMatchMedia = window.matchMedia;
beforeEach(() => {
  desktop = true;
  window.matchMedia = (query) => ({
    matches: desktop && /min-width|pointer:\s*fine|hover:\s*hover/.test(query),
    media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  });
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.useRealTimers();
});

const theme = createBuJoTheme('light');
const mount = (task = privateTask(), props = {}) => render(
  <ThemeProvider theme={theme}>
    <PrivacyProvider>
      <ul><PenRow task={task} now={now} onToggleExpand={vi.fn()} onDone={vi.fn()} {...props} /></ul>
    </PrivacyProvider>
  </ThemeProvider>,
);

/** Nothing of the task's words anywhere in the markup: text, attributes, labels. */
const expectNoSecret = (container) => {
  expect(container.innerHTML).not.toContain('Jane');
  expect(container.innerHTML).not.toContain('legal');
  expect(container.textContent).not.toContain('Jane');
};
const hiddenButton = () => screen.queryByRole('button', { name: HIDDEN_LABEL });

describe('desktop: hidden by default', () => {
  it('renders no words, tags or note — only the mark, a bar, and a labelled button', () => {
    const { container } = mount();
    expectNoSecret(container);
    expect(hiddenButton()).toBeInTheDocument();
    expect(container.querySelector('[data-redaction]')).not.toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Done: Private task' })).toBeInTheDocument();
    // The row keeps its shape: the priority mark is still there.
    expect(container.querySelector('[data-priority-mark="1"]')).not.toBeNull();
  });

  it('a non-private task is untouched (the control)', () => {
    mount(privateTask({ private: false }));
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    expect(hiddenButton()).toBeNull();
  });

  it('a click reveals that task in place; its eye button hides it again', () => {
    const { container } = mount();
    fireEvent.click(hiddenButton());
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: `Done: ${SECRET}` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide private task' }));
    expectNoSecret(container);
    expect(hiddenButton()).toBeInTheDocument();
  });

  it('reveals only the one clicked', () => {
    render(
      <ThemeProvider theme={theme}>
        <PrivacyProvider>
          <ul>
            <PenRow task={privateTask()} now={now} />
            <PenRow task={privateTask({ id: 'p2', content: 'Finish write-up for David', note: null, tags: [] })} now={now} />
          </ul>
        </PrivacyProvider>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: HIDDEN_LABEL })[0]);
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    expect(screen.queryByText(/David/)).toBeNull();
  });

  it('the hidden button is a real button, so Enter and Space reach it from the keyboard', () => {
    mount();
    const btn = hiddenButton();
    expect(btn.tagName).toBe('BUTTON');
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });

  it('Escape hides it again', () => {
    const { container } = mount();
    fireEvent.click(hiddenButton());
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expectNoSecret(container);
  });

  it('the window losing focus hides it again', () => {
    const { container } = mount();
    fireEvent.click(hiddenButton());
    act(() => { window.dispatchEvent(new Event('blur')); });
    expectNoSecret(container);
  });

  it('the page going hidden hides it again', () => {
    const { container } = mount();
    fireEvent.click(hiddenButton());
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    } finally {
      delete document.visibilityState;
      if (desc) Object.defineProperty(Document.prototype, 'visibilityState', desc);
    }
    expectNoSecret(container);
  });

  it('it hides itself after 60 seconds', () => {
    vi.useFakeTimers();
    const { container } = mount();
    fireEvent.click(hiddenButton());
    act(() => { vi.advanceTimersByTime(REVEAL_MS - 1); });
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1); });
    expectNoSecret(container);
  });

  it('an open editor shows the words while open, and blurs while the window is away', () => {
    const { container } = mount(privateTask(), { expanded: true, editor: <div data-testid="editor">editing</div> });
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    expect(container.querySelector('[data-private-away]')).toBeNull();
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(container.querySelector('[data-private-away="true"]')).not.toBeNull();
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(container.querySelector('[data-private-away]')).toBeNull();
  });

  it('without a provider it fails safe: hidden, and a click cannot reveal it', () => {
    const { container } = render(
      <ThemeProvider theme={theme}><ul><PenRow task={privateTask()} now={now} /></ul></ThemeProvider>,
    );
    fireEvent.click(hiddenButton());
    expectNoSecret(container);
  });
});

describe('phone: shown, with the mark', () => {
  it('shows the words, tags and note, and an eye-slash mark', () => {
    desktop = false;
    const { container } = mount();
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(container.querySelector('[data-private-mark]')).not.toBeNull();
    expect(hiddenButton()).toBeNull();
    // Read as private, too.
    expect(screen.getByRole('button', { name: /Fire Jane.*, private/ })).toBeInTheDocument();
  });
});

/* ---------- every list ---------- */

const pen = {};
vi.mock('../../context/PenContext', () => ({ usePen: () => pen }));
vi.mock('../../hooks/usePinnedTags', () => ({ default: () => ({ pinned: [], toggle: vi.fn(), setPinned: vi.fn(), loaded: true }) }));

const { default: TodayPage } = await import('../../pages/TodayPage');
const { default: UpcomingPage } = await import('../../pages/UpcomingPage');
const { default: DonePage } = await import('../../pages/DonePage');
const { default: SearchPage } = await import('../../pages/SearchPage');

const on = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00.000Z`;
const CORPUS = [
  privateTask({ id: 'a', dueDate: on(9, 27) }), // carried over
  privateTask({ id: 'b', content: 'Fire Jane today', dueDate: on(9, 29) }),
  privateTask({ id: 'c', content: 'Fire Jane anytime', dueDate: null }),
  privateTask({ id: 'd', content: 'Fire Jane friday', dueDate: on(10, 2) }),
  privateTask({ id: 'e', content: 'Fired Jane', status: 'completed', completedAt: new Date(2026, 8, 29, 9).toISOString(), dueDate: on(9, 29) }),
];

const setPen = () => Object.assign(pen, {
  loaded: true, now, corpus: CORPUS, visible: filterByTag(CORPUS, null), settling: new Set(), tagFilter: null,
  setTagFilter: vi.fn(), setHelpOpen: vi.fn(), toggleDone: vi.fn(), moveTo: vi.fn(), moveToTomorrow: vi.fn(),
  moveAllToToday: vi.fn(), remove: vi.fn(), save: vi.fn(), add: vi.fn(),
});

const page = (Page, path = '/') => render(
  <MemoryRouter initialEntries={[path]}>
    <ThemeProvider theme={theme}><PrivacyProvider><Page /></PrivacyProvider></ThemeProvider>
  </MemoryRouter>,
);

describe('every list hides them on a desktop', () => {
  beforeEach(setPen);

  it('Today (carried over opened, today, anytime)', () => {
    const { container } = page(TodayPage);
    const line = screen.queryByRole('button', { name: /carried over/i });
    if (line) fireEvent.click(line);
    expect(screen.getAllByRole('button', { name: HIDDEN_LABEL }).length).toBeGreaterThanOrEqual(3);
    // The add box's own placeholder is the only "Jane"-free text we expect; no task words.
    expect(container.textContent).not.toMatch(/Jane/);
  });

  it('Upcoming', () => {
    const { container } = page(UpcomingPage);
    expect(screen.getAllByRole('button', { name: HIDDEN_LABEL }).length).toBeGreaterThanOrEqual(1);
    expect(container.innerHTML).not.toMatch(/Jane/);
  });

  it('Done', () => {
    const { container } = page(DonePage);
    expect(screen.getAllByRole('button', { name: HIDDEN_LABEL }).length).toBeGreaterThanOrEqual(1);
    expect(container.innerHTML).not.toMatch(/Jane/);
  });

  it('Search results', () => {
    const { container } = page(SearchPage, '/search?q=fire');
    const list = container.querySelector('ul');
    expect(list).not.toBeNull();
    expect(within(list).getAllByRole('button', { name: HIDDEN_LABEL }).length).toBeGreaterThanOrEqual(1);
    expect(list.innerHTML).not.toMatch(/Jane/);
  });
});
