/**
 * Simple and Full, per person (DOCS/SIMPLE_AND_FULL_PLAN.md): the provider
 * reads the saved choice, falls back to the default rule when there is none,
 * writes PARTIAL updates (CONTEXT.md "Settings writes are PARTIAL"), and
 * applies Larger text to the document.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const get = vi.fn();
const update = vi.fn();
const activity = vi.fn();

vi.mock('../../services/experienceService.js', () => ({
  experienceService: {
    get: (...a) => get(...a),
    update: (...a) => update(...a),
    activity: (...a) => activity(...a),
  },
}));
vi.mock('@geeksuite/auth', () => ({
  useAuth: () => ({ isAuthenticated: true, loading: false, user: { name: 'heather.b', email: 'h@example.com' } }),
}));

const { ExperienceProvider, useExperience } = await import('../ExperienceContext.jsx');

function Probe() {
  const x = useExperience();
  return (
    <div>
      <span data-testid="state">{x.loading ? 'loading' : `${x.effectiveMode}|${x.savedMode ?? 'unset'}|${x.largerText}|${x.firstRunDone}`}</span>
      <span data-testid="name">{x.displayName}</span>
      <button onClick={() => x.setMode('full')}>full</button>
      <button onClick={() => x.setLargerText(true)}>larger</button>
      <button onClick={() => x.completeFirstRun({ preferred_name: 'Heather', goal: 'track' })}>finish</button>
    </div>
  );
}

const mount = () => render(<ExperienceProvider today="2026-09-27"><Probe /></ExperienceProvider>);
const state = () => screen.getByTestId('state').textContent;

beforeEach(() => {
  vi.clearAllMocks();
  try { window.localStorage.clear(); } catch { /* jsdom */ }
  document.documentElement.removeAttribute('data-text-size');
  update.mockResolvedValue({ success: true });
});

describe('ExperienceProvider', () => {
  it('a saved mode is what the person sees, and the history is never asked', async () => {
    get.mockResolvedValue({ mode: 'simple', larger_text: false, first_run_done: true });
    mount();
    await waitFor(() => expect(state()).toBe('simple|simple|false|true'));
    expect(activity).not.toHaveBeenCalled();
  });

  it('never chose + recent logs → Full, from the default rule', async () => {
    get.mockResolvedValue({ mode: null });
    activity.mockResolvedValue({ foodLogs: [{ log_date: '2026-09-26T00:00:00.000Z' }] });
    mount();
    await waitFor(() => expect(state()).toBe('full|unset|false|false'));
  });

  it('never chose + nothing logged → Simple', async () => {
    get.mockResolvedValue(null);
    activity.mockResolvedValue({ foodLogs: [], weights: [], bloodPressures: [] });
    mount();
    await waitFor(() => expect(state()).toBe('simple|unset|false|false'));
  });

  it('an older gateway without the field still gets a mode (the default rule)', async () => {
    get.mockRejectedValue(new Error('Cannot query field "experience"'));
    activity.mockResolvedValue({ foodLogs: [] });
    mount();
    await waitFor(() => expect(state()).toBe('simple|unset|false|false'));
  });

  it('switching writes ONLY the mode — a partial save', async () => {
    get.mockResolvedValue({ mode: 'simple', larger_text: true, first_run_done: true });
    mount();
    await waitFor(() => expect(state()).toBe('simple|simple|true|true'));
    await act(async () => { fireEvent.click(screen.getByText('full')); });
    expect(update).toHaveBeenCalledWith({ mode: 'full' });
    expect(state()).toBe('full|full|true|true');
  });

  it('Larger text writes { larger_text } and grows the whole document', async () => {
    get.mockResolvedValue({ mode: 'full', larger_text: false, first_run_done: true });
    mount();
    await waitFor(() => expect(document.documentElement.dataset.textSize).toBe('normal'));
    await act(async () => { fireEvent.click(screen.getByText('larger')); });
    expect(update).toHaveBeenCalledWith({ larger_text: true });
    expect(document.documentElement.dataset.textSize).toBe('larger');
  });

  it('a failed save rolls back rather than pretending', async () => {
    get.mockResolvedValue({ mode: 'simple', first_run_done: true });
    update.mockRejectedValue(new Error('offline'));
    mount();
    await waitFor(() => expect(state()).toBe('simple|simple|false|true'));
    await act(async () => { fireEvent.click(screen.getByText('full')); });
    expect(state()).toBe('simple|simple|false|true');
  });

  it('finishing the first run saves the answers AND Simple, so her first log cannot flip her to Full', async () => {
    get.mockResolvedValue({ mode: null, first_run_done: false });
    activity.mockResolvedValue({ foodLogs: [] });
    mount();
    await waitFor(() => expect(state()).toBe('simple|unset|false|false'));
    await act(async () => { fireEvent.click(screen.getByText('finish')); });
    expect(update).toHaveBeenCalledWith({ preferred_name: 'Heather', goal: 'track', first_run_done: true, mode: 'simple' });
    expect(state()).toBe('simple|simple|false|true');
  });

  it('greets by the name she gave, else the account name', async () => {
    get.mockResolvedValue({ mode: 'simple', first_run_done: true, preferred_name: null });
    mount();
    await waitFor(() => expect(screen.getByTestId('name').textContent).toBe('Heather'));
  });
});
