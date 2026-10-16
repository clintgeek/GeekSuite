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
const HEATHER = { id: 'u-heather', name: 'heather.b', email: 'h@example.com' };
vi.mock('@geeksuite/auth', () => ({
  useAuth: () => ({ isAuthenticated: true, loading: false, user: HEATHER }),
}));

const { ExperienceProvider, useExperience } = await import('../ExperienceContext.jsx');

function Probe() {
  const x = useExperience();
  return (
    <div>
      <span data-testid="state">{x.loading ? 'loading' : `${x.effectiveMode}|${x.savedMode ?? 'unset'}|${x.largerText}|${x.firstRunDone}`}</span>
      <span data-testid="known">{String(x.known)}</span>
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
  get.mockReset();
  activity.mockReset();
  update.mockReset();
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

  it('never chose + recent logs → Full, from the default rule, and that answer is SAVED once', async () => {
    get.mockResolvedValue({ mode: null });
    activity.mockResolvedValue({ foodLogs: [{ log_date: '2026-09-26T00:00:00.000Z' }] });
    mount();
    await waitFor(() => expect(state()).toBe('full|full|false|false'));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ mode: 'full' });
  });

  it('never chose + nothing logged → Simple, saved, so her first breakfast cannot flip her to Full', async () => {
    get.mockResolvedValue(null);
    activity.mockResolvedValue({ foodLogs: [], weights: [], bloodPressures: [] });
    mount();
    await waitFor(() => expect(state()).toBe('simple|simple|false|false'));
    expect(update).toHaveBeenCalledWith({ mode: 'simple' });
  });

  it('a derived mode whose save fails is still shown, and not claimed as saved', async () => {
    get.mockResolvedValue({ mode: null });
    activity.mockResolvedValue({ foodLogs: [] });
    update.mockRejectedValue(new Error('offline'));
    mount();
    await waitFor(() => expect(update).toHaveBeenCalledWith({ mode: 'simple' }));
    await waitFor(() => expect(state()).toBe('simple|unset|false|false'));
  });

  it('a history that could not be read is not saved as an answer', async () => {
    get.mockResolvedValue({ mode: null });
    activity.mockRejectedValue(new Error('Network Error'));
    mount();
    await waitFor(() => expect(state()).toBe('simple|unset|false|false'));
    expect(update).not.toHaveBeenCalled();
  });

  it('a failed read is NOT "never chose": the cached face stays, the cache is untouched, the first run stays hidden', async () => {
    const cachedValue = JSON.stringify({ saved: { mode: 'simple', first_run_done: true, larger_text: true }, derivedMode: null });
    window.localStorage.setItem('fg.experience.v1.u-heather', cachedValue);
    get.mockRejectedValue(Object.assign(new Error('Network Error'), { networkError: { statusCode: 503 } }));
    mount();
    await waitFor(() => expect(screen.getByTestId('known').textContent).toBe('false'));
    expect(state()).toBe('simple|simple|true|true');
    expect(activity).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('fg.experience.v1.u-heather')).toBe(cachedValue);
  });

  it('after a failed read, coming back online asks again', async () => {
    get.mockRejectedValueOnce(new Error('Network Error'));
    get.mockResolvedValue({ mode: 'simple', first_run_done: true });
    mount();
    await waitFor(() => expect(screen.getByTestId('known').textContent).toBe('false'));
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(screen.getByTestId('known').textContent).toBe('true'));
    expect(state()).toBe('simple|simple|false|true');
  });

  it("the cache is per person: another account's answer never paints, and the old unkeyed cache is dropped", async () => {
    window.localStorage.setItem('fg.experience.v1', JSON.stringify({ saved: { mode: 'full', larger_text: true, first_run_done: true }, derivedMode: null }));
    window.localStorage.setItem('fg.experience.v1.u-dead', JSON.stringify({ saved: { mode: 'full', larger_text: true, first_run_done: true }, derivedMode: null }));
    let resolveGet;
    get.mockReturnValue(new Promise((r) => { resolveGet = r; }));
    mount();
    // Before the network answers: nothing of the other account's.
    await act(async () => {});
    expect(document.documentElement.dataset.textSize).toBe('normal');
    await act(async () => { resolveGet({ mode: 'simple', first_run_done: true }); });
    await waitFor(() => expect(state()).toBe('simple|simple|false|true'));
    expect(window.localStorage.getItem('fg.experience.v1')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('fg.experience.v1.u-heather')).saved.mode).toBe('simple');
  });

  it("paints this person's own cached face before the network answers", async () => {
    window.localStorage.setItem('fg.experience.v1.u-heather', JSON.stringify({ saved: { mode: 'simple', larger_text: true, first_run_done: true }, derivedMode: null }));
    get.mockReturnValue(new Promise(() => {}));
    mount();
    await waitFor(() => expect(document.documentElement.dataset.textSize).toBe('larger'));
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
