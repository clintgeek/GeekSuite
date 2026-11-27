/**
 * The person's own settings (DOCS/ONE_APP_PLAN.md): there is one app, so the
 * provider no longer answers "Simple or Full". It reads the saved settings,
 * says who still needs the three-step first run (`needsFirstRun`), writes
 * PARTIAL updates (CONTEXT.md "Settings writes are PARTIAL"), never writes
 * `mode`, and applies Larger text to the document.
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
      <span data-testid="state">{x.loading ? 'loading' : `firstRun:${x.needsFirstRun}|larger:${x.largerText}|done:${x.firstRunDone}`}</span>
      <span data-testid="known">{String(x.known)}</span>
      <span data-testid="name">{x.displayName}</span>
      <span data-testid="gone">{['isSimple', 'effectiveMode', 'savedMode', 'setMode'].filter((k) => k in x).join(',')}</span>
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

const modeWrites = () => update.mock.calls.filter(([patch]) => patch && 'mode' in patch);

describe('ExperienceProvider', () => {
  it('has no mode to offer: no isSimple, effectiveMode, savedMode or setMode', async () => {
    get.mockResolvedValue({ mode: 'simple', first_run_done: true });
    mount();
    await waitFor(() => expect(state()).toBe('firstRun:false|larger:false|done:true'));
    expect(screen.getByTestId('gone').textContent).toBe('');
  });

  it('a person saved as "simple" who finished the first run never sees it again, and the history is never asked', async () => {
    get.mockResolvedValue({ mode: 'simple', larger_text: false, first_run_done: true });
    mount();
    await waitFor(() => expect(state()).toBe('firstRun:false|larger:false|done:true'));
    expect(activity).not.toHaveBeenCalled();
  });

  it('a person saved as "simple" who never finished it still needs it', async () => {
    get.mockResolvedValue({ mode: 'simple', first_run_done: false });
    mount();
    await waitFor(() => expect(state()).toBe('firstRun:true|larger:false|done:false'));
    expect(activity).not.toHaveBeenCalled();
  });

  it('a person saved as "full" never sees the first run, finished or not', async () => {
    get.mockResolvedValue({ mode: 'full', first_run_done: false });
    mount();
    await waitFor(() => expect(state()).toBe('firstRun:false|larger:false|done:false'));
    expect(activity).not.toHaveBeenCalled();
  });

  it('no saved mode + recent logs → no first run, and nothing is written', async () => {
    get.mockResolvedValue({ mode: null });
    activity.mockResolvedValue({ foodLogs: [{ log_date: '2026-09-26T00:00:00.000Z' }] });
    mount();
    await waitFor(() => expect(state()).toBe('firstRun:false|larger:false|done:false'));
    expect(update).not.toHaveBeenCalled();
  });

  it('no saved mode + nothing logged → the first run, and still nothing is written', async () => {
    get.mockResolvedValue(null);
    activity.mockResolvedValue({ foodLogs: [], weights: [], bloodPressures: [] });
    mount();
    await waitFor(() => expect(state()).toBe('firstRun:true|larger:false|done:false'));
    expect(update).not.toHaveBeenCalled();
  });

  it('a history that could not be read falls back to the first run, and is not saved as an answer', async () => {
    get.mockResolvedValue({ mode: null });
    activity.mockRejectedValue(new Error('Network Error'));
    mount();
    await waitFor(() => expect(state()).toBe('firstRun:true|larger:false|done:false'));
    expect(update).not.toHaveBeenCalled();
  });

  it('a failed read is NOT "never used it": the cached answer stays, the cache is untouched, the first run stays hidden', async () => {
    const cachedValue = JSON.stringify({ saved: { mode: 'simple', first_run_done: false, larger_text: true }, derivedMode: null });
    window.localStorage.setItem('fg.experience.v1.u-heather', cachedValue);
    get.mockRejectedValue(Object.assign(new Error('Network Error'), { networkError: { statusCode: 503 } }));
    mount();
    await waitFor(() => expect(screen.getByTestId('known').textContent).toBe('false'));
    // Saved as simple and not finished — but unread, so no first run.
    expect(state()).toBe('firstRun:false|larger:true|done:false');
    expect(activity).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('fg.experience.v1.u-heather')).toBe(cachedValue);
  });

  it('after a failed read, coming back online asks again', async () => {
    get.mockRejectedValueOnce(new Error('Network Error'));
    get.mockResolvedValue({ mode: 'simple', first_run_done: false });
    mount();
    await waitFor(() => expect(screen.getByTestId('known').textContent).toBe('false'));
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(screen.getByTestId('known').textContent).toBe('true'));
    expect(state()).toBe('firstRun:true|larger:false|done:false');
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
    await waitFor(() => expect(state()).toBe('firstRun:false|larger:false|done:true'));
    expect(window.localStorage.getItem('fg.experience.v1')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('fg.experience.v1.u-heather')).saved.first_run_done).toBe(true);
  });

  it("paints this person's own cached answer before the network answers", async () => {
    window.localStorage.setItem('fg.experience.v1.u-heather', JSON.stringify({ saved: { mode: 'simple', larger_text: true, first_run_done: true }, derivedMode: null }));
    get.mockReturnValue(new Promise(() => {}));
    mount();
    await waitFor(() => expect(document.documentElement.dataset.textSize).toBe('larger'));
  });

  it('Larger text writes ONLY { larger_text } — a partial save — and grows the whole document', async () => {
    get.mockResolvedValue({ mode: 'full', larger_text: false, first_run_done: true });
    mount();
    await waitFor(() => expect(document.documentElement.dataset.textSize).toBe('normal'));
    await act(async () => { fireEvent.click(screen.getByText('larger')); });
    expect(update).toHaveBeenCalledWith({ larger_text: true });
    expect(document.documentElement.dataset.textSize).toBe('larger');
    expect(state()).toBe('firstRun:false|larger:true|done:true');
  });

  it('a failed save rolls back rather than pretending', async () => {
    get.mockResolvedValue({ mode: 'simple', first_run_done: true });
    update.mockRejectedValue(new Error('offline'));
    mount();
    await waitFor(() => expect(state()).toBe('firstRun:false|larger:false|done:true'));
    await act(async () => { fireEvent.click(screen.getByText('larger')); });
    expect(state()).toBe('firstRun:false|larger:false|done:true');
    expect(document.documentElement.dataset.textSize).toBe('normal');
  });

  it('finishing the first run saves the answers and that it is done — never a mode — and it does not show again', async () => {
    get.mockResolvedValue({ mode: null, first_run_done: false });
    activity.mockResolvedValue({ foodLogs: [] });
    mount();
    await waitFor(() => expect(state()).toBe('firstRun:true|larger:false|done:false'));
    await act(async () => { fireEvent.click(screen.getByText('finish')); });
    expect(update).toHaveBeenCalledWith({ preferred_name: 'Heather', goal: 'track', first_run_done: true });
    expect(modeWrites()).toEqual([]);
    expect(state()).toBe('firstRun:false|larger:false|done:true');
  });

  it('greets by the name she gave, else the account name', async () => {
    get.mockResolvedValue({ mode: 'simple', first_run_done: true, preferred_name: null });
    mount();
    await waitFor(() => expect(screen.getByTestId('name').textContent).toBe('Heather'));
  });
});
