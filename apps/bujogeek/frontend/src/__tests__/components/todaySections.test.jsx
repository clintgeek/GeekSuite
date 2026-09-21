/**
 * The three Today sections render at all.
 *
 * Written because the suite went green while `pnpm build` failed: a
 * duplicated `onMoveToTomorrow` in `OverdueSection`'s parameter list is a
 * PARSE error, and no test imported the file, so nothing transformed it.
 * Vitest only compiles what a test reaches.
 *
 * These are deliberately shallow — mounting each section with a task and
 * asserting it renders. That is enough to make a syntax error, a bad import
 * or a crash-on-mount fail the suite rather than only the build, which is the
 * gap that let it through.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { createBuJoTheme } from '../../theme/theme';
import OverdueSection from '../../components/today/OverdueSection';
import TodaySection from '../../components/today/TodaySection';
import UpcomingSection from '../../components/today/UpcomingSection';

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return { ...actual, useMutation: () => [vi.fn(), { loading: false }] };
});

const theme = createBuJoTheme('light');

const TASK = {
  id: 't1',
  content: 'Call the roofer',
  status: 'pending',
  priority: null,
  dueDate: '2026-09-21T00:00:00.000Z',
  subtasks: [],
};

const handlers = () => ({
  onStatusToggle: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onSaveAsNote: vi.fn(),
  onCancel: vi.fn(),
  onBlock: vi.fn(),
  onMoveToTomorrow: vi.fn(),
  subtaskProps: {},
});

const mount = (Section, props = {}) =>
  render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <Section tasks={[TASK]} {...handlers()} {...props} />
      </ThemeProvider>
    </MemoryRouter>
  );

describe.each([
  ['OverdueSection', OverdueSection],
  ['TodaySection', TodaySection],
  ['UpcomingSection', UpcomingSection],
])('%s', (name, Section) => {
  it('mounts and shows the task', () => {
    mount(Section);
    expect(screen.getByText('Call the roofer')).toBeInTheDocument();
  });

  it('mounts with an empty list', () => {
    // Empty states are where a section is most likely to reach into an
    // undefined first element.
    expect(() => mount(Section, { tasks: [] })).not.toThrow();
  });
});
