/**
 * Speak it (DOCS/SIMPLE_AND_FULL_PLAN.md item 3). The microphone exists only
 * where the browser can listen, shows an obvious listening state, says a
 * plain sentence when the microphone is refused, and hands what it heard to
 * the EXISTING describe-and-log path — the same `onDescribe` typing uses,
 * with the box's meal.
 *
 * SpeechRecognition is a mock class; nothing listens.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';

vi.mock('../../services/foodService', () => ({
  foodService: { suggest: vi.fn(() => Promise.resolve([])), search: vi.fn(() => Promise.resolve([])) },
}));

const { default: UnifiedFoodSearch } = await import('../FoodSearch/UnifiedFoodSearch.jsx');

let instances = [];
class FakeRecognition {
  constructor() {
    this.start = vi.fn();
    this.stop = vi.fn(() => this.onend?.());
    this.abort = vi.fn();
    instances.push(this);
  }
  // Test helpers: what the browser would fire.
  hear(text, isFinal = true) {
    const result = [{ transcript: text }];
    result.isFinal = isFinal;
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
  end() { this.onend?.(); }
  fail(error) { this.onerror?.({ error }); this.onend?.(); }
}

const onDescribe = vi.fn();
const renderBox = (props = {}) => render(
  <GeekToastProvider>
    <UnifiedFoodSearch mode="dialog" mealType="lunch" onLogItems={vi.fn()} onDescribe={onDescribe} {...props} />
  </GeekToastProvider>
);

beforeEach(() => {
  instances = [];
  onDescribe.mockReset();
  onDescribe.mockResolvedValue({ ok: 1, fail: 0, logIds: ['x'], logged: [{ logId: 'x', name: 'Eggs', calories: 140, mealType: 'lunch' }], skipped: [], questions: [] });
});

afterEach(() => {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
});

describe('the microphone', () => {
  it('is not offered where the browser cannot listen', () => {
    renderBox();
    expect(screen.queryByRole('button', { name: /say what you ate/i })).toBeNull();
  });

  it('is offered under the prefixed name Chrome on Android uses', () => {
    window.webkitSpeechRecognition = FakeRecognition;
    renderBox();
    // The big button in the sheet, and the one in the box — both reachable.
    expect(screen.getAllByRole('button', { name: /say what you ate/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('is a keyboard control with a pressed state, and shows that it is listening', async () => {
    window.SpeechRecognition = FakeRecognition;
    renderBox();
    const mic = screen.getByRole('button', { name: 'Say what you ate', pressed: false });
    await act(async () => { fireEvent.click(mic); });
    expect(instances[0].start).toHaveBeenCalled();
    expect(screen.getByTestId('mic-listening')).toHaveTextContent('Listening… say what you ate');
    expect(screen.getByRole('button', { name: 'Stop listening', pressed: true })).toBeInTheDocument();
  });

  it('hands what it heard to describe-and-log, with the meal the sheet is set to', async () => {
    window.webkitSpeechRecognition = FakeRecognition;
    renderBox();
    await act(async () => { fireEvent.click(screen.getByTestId('speak-button')); });
    await act(async () => {
      instances[0].hear('two eggs and toast', false);
    });
    expect(screen.getByTestId('mic-listening')).toHaveTextContent('“two eggs and toast”');
    await act(async () => {
      instances[0].hear('two eggs and toast');
      instances[0].end();
    });
    await waitFor(() => expect(onDescribe).toHaveBeenCalledWith('two eggs and toast', { mealType: 'lunch' }));
    expect(onDescribe).toHaveBeenCalledTimes(1);
  });

  it('heard nothing → nothing is logged', async () => {
    window.SpeechRecognition = FakeRecognition;
    renderBox();
    await act(async () => { fireEvent.click(screen.getByTestId('speak-button')); });
    await act(async () => { instances[0].fail('no-speech'); });
    expect(onDescribe).not.toHaveBeenCalled();
    expect(screen.getByTestId('mic-error')).toHaveTextContent("I didn't hear anything");
  });

  it('a refused microphone gets a plain sentence, not an error code', async () => {
    window.SpeechRecognition = FakeRecognition;
    renderBox();
    await act(async () => { fireEvent.click(screen.getByTestId('speak-button')); });
    await act(async () => { instances[0].fail('not-allowed'); });
    const note = screen.getByTestId('mic-error');
    expect(note).toHaveTextContent('FitnessGeek needs your microphone to hear you');
    expect(note.textContent).not.toMatch(/not-allowed/);
    expect(screen.queryByTestId('mic-listening')).toBeNull();
  });
});
