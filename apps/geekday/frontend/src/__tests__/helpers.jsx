// Test wrappers: the Desk Diary theme, and Apollo with canned answers.
import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { MockedProvider } from '@apollo/client/testing';
import { render } from '@testing-library/react';
import createDayTheme from '../theme/theme.js';

export function renderDay(ui, { mocks = [], mode = 'light' } = {}) {
  return render(
    <ThemeProvider theme={createDayTheme(mode)}>
      <MockedProvider mocks={mocks}>
        {ui}
      </MockedProvider>
    </ThemeProvider>
  );
}

export const dateOnly = (key) => `${key}T00:00:00.000Z`;

// `__typename` as the gateway sends it: Apollo matches `...DayTaskFields on Task` by it.
export const makeTask = (over) => ({
  __typename: 'Task',
  id: over.id || over.content,
  content: 'x',
  signifier: '*',
  status: 'pending',
  priority: null,
  tags: [],
  dueDate: null,
  hasDueTime: false,
  private: false,
  recurrenceRule: null,
  seriesId: null,
  isSeriesMaster: false,
  completedAt: null,
  cancelledAt: null,
  createdAt: '2026-11-19T12:00:00.000Z',
  ...over,
});
