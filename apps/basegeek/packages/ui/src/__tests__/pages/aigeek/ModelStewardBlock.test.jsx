import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import ModelStewardBlock from '../../../pages/aigeek/ModelStewardBlock';
import { renderWithProviders } from '../../testUtils';

const FREE_MODELS = [
  {
    provider: 'groq', modelId: 'llama-3.3-70b', name: 'Llama 3.3 70B', contextWindow: 131072,
    supportsJSONOutput: true, supportsFunctionCalling: true, supportsVision: false,
    performance: { speed: 'fast', quality: 'good' },
  },
  {
    provider: 'cerebras', modelId: 'llama-4-scout', name: 'Llama 4 Scout', contextWindow: 8192,
    supportsJSONOutput: false, supportsFunctionCalling: false, supportsVision: false,
    performance: { speed: 'blazing', quality: 'ok' },
  },
];

function baseProps(overrides = {}) {
  return {
    freeModels: FREE_MODELS,
    freeModelsLoading: false,
    recommendTask: '',
    recommendPriority: 'cost',
    recommendations: null,
    recommending: false,
    isPinned: () => false,
    onTaskChange: vi.fn(),
    onPriorityChange: vi.fn(),
    onRecommend: vi.fn(),
    onPickModel: vi.fn(),
    onLoadFreeModels: vi.fn(),
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

  it('shows a "no free model matched" warning when recommendations resolve empty', () => {
    renderWithProviders(<ModelStewardBlock {...baseProps({ recommendations: [] })} />);
    expect(screen.getByText(/No free model matched that description/)).toBeInTheDocument();
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

  it('shows a loading spinner instead of the browse list while freeModelsLoading', () => {
    const { container } = renderWithProviders(<ModelStewardBlock {...baseProps({ freeModelsLoading: true })} />);
    expect(container.querySelector('.MuiCircularProgress-root')).toBeInTheDocument();
    expect(screen.queryByLabelText('Free models')).not.toBeInTheDocument();
  });

  it('shows a GeekEmptyState with a Retry action when there are no free models', () => {
    const onLoadFreeModels = vi.fn();
    renderWithProviders(<ModelStewardBlock {...baseProps({ freeModels: [], onLoadFreeModels })} />);
    expect(screen.getByText('No free models available')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onLoadFreeModels).toHaveBeenCalledTimes(1);
  });

  it('lists every free model in the browse select, with a count in the helper text', async () => {
    renderWithProviders(<ModelStewardBlock {...baseProps()} />);
    expect(screen.getByText('2 free models reachable right now')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByLabelText('Free models'));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByText(/Llama 3\.3 70B/)).toBeInTheDocument();
    expect(within(listbox).getByText(/Llama 4 Scout/)).toBeInTheDocument();
  });

  it('picking a model from the browse select calls onPickModel', async () => {
    const onPickModel = vi.fn();
    renderWithProviders(<ModelStewardBlock {...baseProps({ onPickModel })} />);
    fireEvent.mouseDown(screen.getByLabelText('Free models'));
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByText(/Llama 4 Scout/));
    expect(onPickModel).toHaveBeenCalledWith('cerebras', 'llama-4-scout');
  });
});
