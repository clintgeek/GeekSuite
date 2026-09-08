/**
 * AppConfigDialog.test.jsx — the Phase 2 routing controls, minimally.
 *
 * DOCS/AIGEEK_FRONT_DOOR.md collapsed the routing tiers to `auto` and
 * `specific` and added two switches: sticky picks and the paid fallback.
 * Phase 3 redesigns this whole page into a status page, so these cases are
 * about the controls being *reachable and correct*, not about the layout.
 *
 * The one thing here worth defending past Phase 3 is the tolerant read: a row
 * still stored as `free` or `rotation` — every row in production, until it is
 * next saved — must show as Automatic, which is what it now does, rather than
 * as a blank select or a value the enum no longer offers.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import AppConfigDialog from '../../../pages/aigeek/dialogs/AppConfigDialog';
import { renderWithProviders } from '../../testUtils';

function baseProps(editing = {}, overrides = {}) {
  return {
    editing: { appName: 'storygeek', tier: 'auto', ...editing },
    providers: ['groq', 'gemini'],
    freeModels: [],
    freeModelsLoading: false,
    recommendTask: '',
    recommendPriority: 'cost',
    recommendations: null,
    recommending: false,
    onPatch: vi.fn(),
    onTaskChange: vi.fn(),
    onPriorityChange: vi.fn(),
    onRecommend: vi.fn(),
    onPickModel: vi.fn(),
    onLoadFreeModels: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
}

const tierSelect = () => screen.getByLabelText('Routing tier');
const stickySwitch = () => screen.getByLabelText(/Sticky per conversation/);
const paidSwitch = () => screen.getByLabelText(/Allow paid fallback/);

describe('AppConfigDialog — the routing tier', () => {
  it('offers exactly Automatic and Specific', () => {
    renderWithProviders(<AppConfigDialog {...baseProps()} />);
    const values = [...tierSelect().querySelectorAll('option')].map(o => o.value);
    expect(values).toEqual(['auto', 'specific']);
  });

  it('defaults a new row to Automatic', () => {
    renderWithProviders(<AppConfigDialog {...baseProps({ tier: undefined })} />);
    expect(tierSelect().value).toBe('auto');
  });

  for (const legacy of ['free', 'rotation']) {
    it(`shows a legacy tier: '${legacy}' row as Automatic, which is what it now does`, () => {
      // Every row in production is one of these until it is next saved, and
      // `auto` is exactly what `aiRoute.resolveRoute` reads them as. A select
      // with no matching option would render blank and silently rewrite the
      // row to whatever the first option is on the next Save.
      renderWithProviders(<AppConfigDialog {...baseProps({ tier: legacy })} />);
      expect(tierSelect().value).toBe('auto');
    });
  }

  it('keeps a pinned row on Specific and shows the provider and model fields', () => {
    renderWithProviders(<AppConfigDialog {...baseProps({ tier: 'specific', provider: 'groq', model: 'llama' })} />);
    expect(tierSelect().value).toBe('specific');
    expect(screen.getByLabelText('Provider')).toHaveValue('groq');
    expect(screen.getByLabelText('Model ID')).toHaveValue('llama');
  });

  it('hides the pin fields under Automatic', () => {
    renderWithProviders(<AppConfigDialog {...baseProps()} />);
    expect(screen.queryByLabelText('Model ID')).toBeNull();
  });

  it('patches the tier on change', () => {
    const onPatch = vi.fn();
    renderWithProviders(<AppConfigDialog {...baseProps({}, { onPatch })} />);
    fireEvent.change(tierSelect(), { target: { value: 'specific' } });
    expect(onPatch).toHaveBeenCalledWith({ tier: 'specific' });
  });
});

describe('AppConfigDialog — the two Phase 2 switches', () => {
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

  it('allowPaid is off by default — the default that keeps the $10 lasting', () => {
    const onPatch = vi.fn();
    renderWithProviders(<AppConfigDialog {...baseProps({}, { onPatch })} />);
    expect(paidSwitch()).not.toBeChecked();
    fireEvent.click(paidSwitch());
    expect(onPatch).toHaveBeenCalledWith({ allowPaid: true });
  });

  it('allowPaid reads back from the row', () => {
    renderWithProviders(<AppConfigDialog {...baseProps({ allowPaid: true })} />);
    expect(paidSwitch()).toBeChecked();
  });

  it('disables both under Specific rather than hiding them — not applicable, not gone', () => {
    // A pinned row has already chosen its model, and a pin never spends
    // through the governor, so neither switch means anything there.
    renderWithProviders(<AppConfigDialog {...baseProps({ tier: 'specific', provider: 'groq', model: 'm' })} />);
    expect(stickySwitch()).toBeDisabled();
    expect(paidSwitch()).toBeDisabled();
  });
});
