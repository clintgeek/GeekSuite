/**
 * ModelStewardBlock.test.jsx — the Suggest half of the steward.
 *
 * Four cases went with the block's "Browse free models" select in Phase 3
 * (apps/basegeek/DOCS/AIGEEK_STATUS_PAGE.md §3): the loading spinner, the
 * empty-state Retry, the "lists every free model" listing and the pick from
 * it. That list is `AliveModelPicker` now, fed by `/api/ai/models/alive`
 * rather than `aiFreeModels`, and it has its own coverage — see
 * `AppsKeysPanel.test.jsx`, which is also where the "never a text field for a
 * model id" assertion lives.
 *
 * Everything below is the recommender, unchanged in behaviour and re-pointed
 * only where the copy moved.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import ModelStewardBlock from '../../../pages/aigeek/ModelStewardBlock';
import { renderWithProviders } from '../../testUtils';

function baseProps(overrides = {}) {
  return {
    recommendTask: '',
    recommendPriority: 'cost',
    recommendations: null,
    recommending: false,
    isPinned: () => false,
    onTaskChange: vi.fn(),
    onPriorityChange: vi.fn(),
    onRecommend: vi.fn(),
    onPickModel: vi.fn(),
    ...overrides,
  };
}

describe('ModelStewardBlock', () => {
  it('disables Recommend with an empty task, enables it once one is typed', () => {
    const { rerender } = renderWithProviders(<ModelStewardBlock {...baseProps()} />);
    expect(screen.getByRole('button', { name: /Recommend/ })).toBeDisabled();
    rerender(<ModelStewardBlock {...baseProps({ recommendTask: 'summarize a note' })} />);
    expect(screen.getByRole('button', { name: /Recommend/ })).not.toBeDisabled();
  });

  it('typing in the task box calls onTaskChange', () => {
    const onTaskChange = vi.fn();
    renderWithProviders(<ModelStewardBlock {...baseProps({ onTaskChange })} />);
    fireEvent.change(screen.getByLabelText('What will this app ask the model to do?'), {
      target: { value: 'turn a query into JSON' },
    });
    expect(onTaskChange).toHaveBeenCalledWith('turn a query into JSON');
  });

  it('clicking a priority toggle calls onPriorityChange', () => {
    const onPriorityChange = vi.fn();
    renderWithProviders(<ModelStewardBlock {...baseProps({ onPriorityChange })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Speed' }));
    expect(onPriorityChange).toHaveBeenCalledWith('speed');
  });

  it('clicking Recommend with a task calls onRecommend', () => {
    const onRecommend = vi.fn();
    renderWithProviders(<ModelStewardBlock {...baseProps({ recommendTask: 'summarize a note', onRecommend })} />);
    fireEvent.click(screen.getByRole('button', { name: /Recommend/ }));
    expect(onRecommend).toHaveBeenCalledTimes(1);
  });

  it('shows "Asking…" and disables Recommend while recommending', () => {
    renderWithProviders(<ModelStewardBlock {...baseProps({ recommendTask: 'x', recommending: true })} />);
    expect(screen.getByRole('button', { name: /Asking/ })).toBeDisabled();
  });

  it('renders a recommendation row with its provider, model id, context window and reasoning', () => {
    renderWithProviders(<ModelStewardBlock {...baseProps({
      recommendations: [
        { provider: 'groq', modelId: 'llama-3.3-70b', name: 'Llama 3.3 70B', score: 91, contextWindow: 131072, reasoning: 'Fast and supports JSON.' },
      ],
    })} />);
    expect(screen.getByText('Llama 3.3 70B')).toBeInTheDocument();
    expect(screen.getByText(/groq/)).toBeInTheDocument();
    expect(screen.getByText(/llama-3.3-70b/)).toBeInTheDocument();
    expect(screen.getByText('Fast and supports JSON.')).toBeInTheDocument();
    expect(screen.getByText('fit 91')).toBeInTheDocument();
  });

  it('shows a "no model matched" warning when recommendations resolve empty', () => {
    renderWithProviders(<ModelStewardBlock {...baseProps({ recommendations: [] })} />);
    expect(screen.getByText(/No model matched that description/)).toBeInTheDocument();
  });

  it('clicking a recommendation row calls onPickModel with its provider and modelId', () => {
    const onPickModel = vi.fn();
    renderWithProviders(<ModelStewardBlock {...baseProps({
      onPickModel,
      recommendations: [
        { provider: 'groq', modelId: 'llama-3.3-70b', name: 'Llama 3.3 70B', score: 91, contextWindow: 131072, reasoning: 'why' },
      ],
    })} />);
    fireEvent.click(screen.getByText('Llama 3.3 70B'));
    expect(onPickModel).toHaveBeenCalledWith('groq', 'llama-3.3-70b');
  });

  it('a recommendation row is reachable and pickable by keyboard (Enter)', () => {
    const onPickModel = vi.fn();
    renderWithProviders(<ModelStewardBlock {...baseProps({
      onPickModel,
      recommendations: [
        { provider: 'groq', modelId: 'llama-3.3-70b', name: 'Llama 3.3 70B', score: 91, contextWindow: 131072, reasoning: 'why' },
      ],
    })} />);
    const row = screen.getByRole('button', { name: /Llama 3.3 70B/ });
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onPickModel).toHaveBeenCalledWith('groq', 'llama-3.3-70b');
  });

});
