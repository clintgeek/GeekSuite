/**
 * AppConfigDialog.test.jsx — the routing dialog after Phase 3.
 *
 * The dialog kept its job but lost its two worst controls. `Routing tier` was
 * a native select; it is now the same segmented `Automatic | Pinned` toggle
 * the app card uses, because one idea should have one control. And `Model ID`
 * was a text field that an admin filled in by reading an id off another tab;
 * it is now `AliveModelPicker`, whose whole vocabulary is what
 * `/api/ai/models/alive` returned (D3 — nobody types a model id).
 *
 * The tier cases below are re-pointed, not new. The one worth defending
 * longest is still the tolerant read: a row stored as `free` or `rotation` —
 * every row in production until it is next saved — must show as Automatic,
 * rather than as a blank control or a value the enum no longer offers.
 *
 * New here: the daily cap, and the two switches under their Phase 3 copy
 * (`Sticky per conversation`, `May spend`).
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import AppConfigDialog from '../../../pages/aigeek/dialogs/AppConfigDialog';
import { renderWithProviders } from '../../testUtils';

const ALIVE_GROUPS = [
  {
    key: 'free',
    label: 'Free',
    rows: [
      { provider: 'groq', modelId: 'llama-3.3-70b', fitness: 'structured', paid: false, lastSuccessAt: null },
    ],
  },
];

function basePicker(overrides = {}) {
  return {
    groups: ALIVE_GROUPS,
    loading: false,
    error: null,
    onReload: vi.fn(),
    suggestApp: null,
    onToggleSuggest: vi.fn(),
    recommendTask: '',
    recommendPriority: 'cost',
    recommendations: null,
    recommending: false,
    onTaskChange: vi.fn(),
    onPriorityChange: vi.fn(),
    onRecommend: vi.fn(),
    ...overrides,
  };
}

function baseProps(editing = {}, overrides = {}) {
  return {
    editing: { appName: 'storygeek', tier: 'auto', ...editing },
    picker: basePicker(),
    onPatch: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
}

const tierGroup = () => screen.getByRole('group', { name: 'Routing tier' });
const automatic = () => screen.getByRole('button', { name: 'Automatic' });
const pinned = () => screen.getByRole('button', { name: 'Pinned' });
const stickySwitch = () => screen.getByLabelText(/Sticky per conversation/);
const paidSwitch = () => screen.getByLabelText(/May spend/);
const capField = () => screen.getByLabelText('Daily cap');

describe('AppConfigDialog — the routing tier', () => {
  it('offers exactly Automatic and Pinned', () => {
    renderWithProviders(<AppConfigDialog {...baseProps()} />);
    const labels = [...tierGroup().querySelectorAll('button')].map(b => b.textContent);
    expect(labels).toEqual(['Automatic', 'Pinned']);
  });

  it('defaults a new row to Automatic', () => {
    renderWithProviders(<AppConfigDialog {...baseProps({ tier: undefined })} />);
    expect(automatic()).toHaveAttribute('aria-pressed', 'true');
  });

  for (const legacy of ['free', 'rotation']) {
    it(`shows a legacy tier: '${legacy}' row as Automatic, which is what it now does`, () => {
      // Every row in production is one of these until it is next saved, and
      // `auto` is exactly what `aiRoute.resolveRoute` reads them as. A control
      // with no matching value would render blank and silently rewrite the row
      // to whatever its first option is on the next Save.
      renderWithProviders(<AppConfigDialog {...baseProps({ tier: legacy })} />);
      expect(automatic()).toHaveAttribute('aria-pressed', 'true');
    });
  }

  it('keeps a pinned row on Pinned and shows the alive-model picker', () => {
    renderWithProviders(<AppConfigDialog {...baseProps({ tier: 'specific', provider: 'groq', model: 'llama-3.3-70b' })} />);
    expect(pinned()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Pinned model')).toHaveValue('groq::llama-3.3-70b');
  });

  it('never offers a text field for a model id, pinned or not (D3)', () => {
    renderWithProviders(<AppConfigDialog {...baseProps({ tier: 'specific', provider: 'groq', model: 'llama-3.3-70b' })} />);
    expect(screen.getByLabelText('Pinned model').tagName).toBe('SELECT');
    expect(screen.queryByLabelText(/model id/i)).toBeNull();
  });

  it('hides the picker under Automatic', () => {
    renderWithProviders(<AppConfigDialog {...baseProps()} />);
    expect(screen.queryByLabelText('Pinned model')).toBeNull();
  });

  it('patches the tier on change', () => {
    const onPatch = vi.fn();
    renderWithProviders(<AppConfigDialog {...baseProps({}, { onPatch })} />);
    fireEvent.click(pinned());
    expect(onPatch).toHaveBeenCalledWith({ tier: 'specific' });
  });

  it('a pick from the picker patches the tier, provider and model together', () => {
    const onPatch = vi.fn();
    renderWithProviders(<AppConfigDialog {...baseProps({ tier: 'specific' }, { onPatch })} />);
    fireEvent.change(screen.getByLabelText('Pinned model'), { target: { value: 'groq::llama-3.3-70b' } });
    expect(onPatch).toHaveBeenCalledWith({ tier: 'specific', provider: 'groq', model: 'llama-3.3-70b' });
  });
});

describe('AppConfigDialog — the two switches', () => {
  it('sticky is off by default and patches the enum value, not a boolean', () => {
    const onPatch = vi.fn();
    renderWithProviders(<AppConfigDialog {...baseProps({}, { onPatch })} />);
    expect(stickySwitch()).not.toBeChecked();
    fireEvent.click(stickySwitch());
    // The schema's enum is `'per-conversation' | null`; a boolean here would
    // fail validation on save.
    expect(onPatch).toHaveBeenCalledWith({ sticky: 'per-conversation' });
  });

  it('sticky reads back from the stored enum value', () => {
    renderWithProviders(<AppConfigDialog {...baseProps({ sticky: 'per-conversation' })} />);
    expect(stickySwitch()).toBeChecked();
  });

  it('turning sticky off patches null, not false', () => {
    const onPatch = vi.fn();
    renderWithProviders(<AppConfigDialog {...baseProps({ sticky: 'per-conversation' }, { onPatch })} />);
    fireEvent.click(stickySwitch());
    expect(onPatch).toHaveBeenCalledWith({ sticky: null });
  });

  it('May spend is off by default — the default that keeps the $10 lasting', () => {
    const onPatch = vi.fn();
    renderWithProviders(<AppConfigDialog {...baseProps({}, { onPatch })} />);
    expect(paidSwitch()).not.toBeChecked();
    fireEvent.click(paidSwitch());
    expect(onPatch).toHaveBeenCalledWith({ allowPaid: true });
  });

  it('May spend reads back from the row', () => {
    renderWithProviders(<AppConfigDialog {...baseProps({ allowPaid: true })} />);
    expect(paidSwitch()).toBeChecked();
  });

  it('disables both under Pinned rather than hiding them — not applicable, not gone', () => {
    // A pinned row has already chosen its model, and a pin never spends
    // through the governor, so neither switch means anything there.
    renderWithProviders(<AppConfigDialog {...baseProps({ tier: 'specific', provider: 'groq', model: 'm' })} />);
    expect(stickySwitch()).toBeDisabled();
    expect(paidSwitch()).toBeDisabled();
  });
});

describe('AppConfigDialog — the daily cap', () => {
  it('is blank when the row has none, which means the door default', () => {
    renderWithProviders(<AppConfigDialog {...baseProps()} />);
    expect(capField()).toHaveValue(null);
    expect(screen.getByText(/default of 200/)).toBeInTheDocument();
  });

  it('reads back the stored number', () => {
    renderWithProviders(<AppConfigDialog {...baseProps({ dailyCap: 40 })} />);
    expect(capField()).toHaveValue(40);
  });

  it('patches what was typed', () => {
    const onPatch = vi.fn();
    renderWithProviders(<AppConfigDialog {...baseProps({}, { onPatch })} />);
    fireEvent.change(capField(), { target: { value: '40' } });
    expect(onPatch).toHaveBeenCalledWith({ dailyCap: '40' });
  });

  it('patches null when cleared — the default, not zero', () => {
    const onPatch = vi.fn();
    renderWithProviders(<AppConfigDialog {...baseProps({ dailyCap: 40 }, { onPatch })} />);
    fireEvent.change(capField(), { target: { value: '' } });
    expect(onPatch).toHaveBeenCalledWith({ dailyCap: null });
  });
});
