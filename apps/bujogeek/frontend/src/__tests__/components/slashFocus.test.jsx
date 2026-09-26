/**
 * `/` on the daily log lands in the rapid-log input (suite slash focus,
 * @geeksuite/ui). It must not steal from BuJo's own keys: `?` still belongs
 * to the help overlay, and a `/` typed into the box stays a `/tomorrow`.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { GeekToastProvider, SlashFocusProvider } from '@geeksuite/ui';
import { createBuJoTheme } from '../../theme/theme';
import InlineQuickAdd from '../../components/today/InlineQuickAdd';

vi.mock('../../hooks/useTaskTags', () => ({ default: () => [] }));
vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return { ...actual, useMutation: () => [vi.fn(), { loading: false }] };
});

function renderQuickAdd() {
  return render(
    <ThemeProvider theme={createBuJoTheme('light')}>
      <GeekToastProvider>
        <SlashFocusProvider>
          <button type="button">elsewhere</button>
          <InlineQuickAdd onAdd={vi.fn()} />
        </SlashFocusProvider>
      </GeekToastProvider>
    </ThemeProvider>
  );
}

describe('slash focus on the daily log', () => {
  it('"/" from the page focuses the quick-add input', () => {
    renderQuickAdd();
    fireEvent.keyDown(screen.getByText('elsewhere'), { key: '/' });
    expect(screen.getByLabelText('Add a task for today')).toHaveFocus();
  });

  it('"?" is left for the help overlay', () => {
    renderQuickAdd();
    fireEvent.keyDown(document.body, { key: '?' });
    expect(screen.getByLabelText('Add a task for today')).not.toHaveFocus();
  });
});
