import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createBuJoTheme } from '../../theme/theme';
import ReviewDraftCard from '../../components/review/ReviewDraftCard';
import { provenanceLine } from '../../utils/provenanceLine';

/**
 * ReviewDraftCard — the guarantees that make the AI weekly review safe to ship
 * (DOCS/AI_IDEAS.md, the shared rules at the top):
 *
 *   - drafts NEVER write: every action on this card is a callback the page
 *     turns into an ordinary mutation;
 *   - a draft always says where it came from, and a deterministic summary is
 *     never dressed up as a model's work;
 *   - the phone rules hold: 44px targets, nothing under 12px.
 */

const theme = createBuJoTheme('light');

const DRAFT = {
  summary: 'You closed one thing and left two open.',
  wins: ['Completed 1 task'],
  carryForward: [{ title: 'Call the roofer', reason: 'Overdue by 5 days.' }],
  suggestedFocus: 'Ring the roofer first thing Monday.',
};

const FACTS = {
  weekStart: '2026-08-31',
  weekEnd: '2026-09-06',
  counts: { completed: 1, carriedForward: 2, blocked: 0, cancelled: 0, created: 3 },
  habits: [],
  overdue: [],
  blocked: [],
};

const modelResult = (overrides = {}) => ({
  facts: FACTS,
  draft: DRAFT,
  provenance: {
    source: 'model',
    reason: null,
    model: 'llama-3.1-8b',
    provider: 'groq',
    cached: false,
    callsToday: 1,
    cap: 10,
  },
  ...overrides,
});

const fallbackResult = (reason) => ({
  facts: FACTS,
  draft: DRAFT,
  provenance: { source: 'fallback', reason, model: null, provider: null, cached: false, callsToday: 0, cap: 10 },
});

function renderCard(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <ReviewDraftCard weekLabel="31 Aug – 6 Sep" {...props} />
    </ThemeProvider>
  );
}

describe('ReviewDraftCard', () => {
  it('costs nothing until asked: with no result it offers a button, not a draft', async () => {
    const onDraft = vi.fn();
    renderCard({ onDraft });

    expect(screen.queryByText(DRAFT.summary)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /draft my review/i }));
    expect(onDraft).toHaveBeenCalledTimes(1);
  });

  it('labels a model draft "AI-drafted" and names the model', () => {
    renderCard({ result: modelResult() });

    expect(screen.getByText('AI-drafted')).toBeInTheDocument();
    expect(screen.getByText(/Drafted by llama-3\.1-8b via groq/)).toBeInTheDocument();
    expect(screen.getByText(/1 of 10 drafts today/)).toBeInTheDocument();
  });

  it('never passes a deterministic summary off as a model answer', () => {
    renderCard({ result: fallbackResult('opted_out') });

    expect(screen.queryByText('AI-drafted')).not.toBeInTheDocument();
    expect(screen.getByText('No model')).toBeInTheDocument();
    expect(screen.getByText(/No model — deterministic summary/)).toBeInTheDocument();
  });

  it('renders the summary, the wins, the carry-forwards and the focus', () => {
    renderCard({ result: modelResult() });

    expect(screen.getByText(DRAFT.summary)).toBeInTheDocument();
    expect(screen.getByText('Completed 1 task')).toBeInTheDocument();
    expect(screen.getByText('Call the roofer')).toBeInTheDocument();
    expect(screen.getByText('Overdue by 5 days.')).toBeInTheDocument();
    expect(screen.getByText(DRAFT.suggestedFocus)).toBeInTheDocument();
  });

  it('"Use as review" hands the draft back — it does not save anything itself', async () => {
    const onUseAsReview = vi.fn();
    renderCard({ result: modelResult(), onUseAsReview });

    fireEvent.click(screen.getByRole('button', { name: /use as review/i }));
    expect(onUseAsReview).toHaveBeenCalledWith(DRAFT, FACTS);
  });

  it('"Add as task" calls back once per row and then reads as done', async () => {
    const onAddTask = vi.fn().mockResolvedValue(undefined);
    renderCard({ result: modelResult(), onAddTask });

    const add = screen.getByRole('button', { name: /add as task/i });
    fireEvent.click(add);

    expect(onAddTask).toHaveBeenCalledWith('Call the roofer');
    await waitFor(() => expect(screen.getByRole('button', { name: /added/i })).toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: /added/i }));
    expect(onAddTask).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error without blanking the card', () => {
    renderCard({ error: 'the gateway said no' });

    expect(screen.getByRole('alert')).toHaveTextContent('the gateway said no');
  });

  it('every control is at least a 44px tap target', () => {
    const { container } = renderCard({ result: modelResult(), onAddTask: vi.fn() });

    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button).toHaveStyle({ minHeight: '44px' });
    }
  });

  /**
   * The 12px text floor, held here rather than in the mobile harness: the
   * harness has no `/review` scene and the card is behind a default-off
   * preference, so nothing else in the repo would catch a caption that shrank.
   */
  it('sets no text under the 12px floor', () => {
    const { container } = renderCard({ result: modelResult(), onAddTask: vi.fn() });

    const offenders = [];
    for (const el of container.querySelectorAll('*')) {
      const raw = window.getComputedStyle(el).fontSize;
      if (!raw) continue;
      const px = raw.endsWith('rem') ? parseFloat(raw) * 16 : parseFloat(raw);
      if (Number.isFinite(px) && px < 12) offenders.push(`${el.tagName}: ${raw}`);
    }
    expect(offenders).toEqual([]);
  });

  it('lets the carry-forward rows wrap instead of scrolling sideways', () => {
    const { container } = renderCard({ result: modelResult(), onAddTask: vi.fn() });

    const row = container.querySelector('button[class*="MuiButton"]')?.closest('div');
    expect(row).not.toBeNull();
    // Every horizontal Stack in this card is allowed to wrap; a phone-width
    // carry-forward row drops its button onto a second line rather than
    // pushing the page wider.
    const wrappers = [...container.querySelectorAll('div')].filter(
      (el) => window.getComputedStyle(el).flexDirection === 'row'
    );
    expect(wrappers.length).toBeGreaterThan(0);
    for (const el of wrappers) {
      expect(window.getComputedStyle(el).flexWrap).toBe('wrap');
    }
  });
});

describe('provenanceLine', () => {
  it('distinguishes every fallback reason', () => {
    expect(provenanceLine({ source: 'fallback', reason: 'opted_out' })).toMatch(/Settings/);
    expect(provenanceLine({ source: 'fallback', reason: 'cap' })).toMatch(/today’s drafts/);
    expect(provenanceLine({ source: 'fallback', reason: 'unavailable' })).toMatch(/did not answer/);
    expect(provenanceLine({ source: 'fallback', reason: 'unparseable' })).toMatch(/did not answer/);
  });

  it('says "cached" when the answer was not freshly generated', () => {
    expect(
      provenanceLine({ source: 'model', model: 'm', provider: 'p', cached: true, callsToday: 2, cap: 10 })
    ).toContain('cached');
  });

  it('never claims a model that is not there', () => {
    expect(provenanceLine({ source: 'model', model: null, provider: null, cached: false, callsToday: 1, cap: 10 }))
      .toContain('an unnamed model');
    expect(provenanceLine(null)).toBe('');
  });
});
