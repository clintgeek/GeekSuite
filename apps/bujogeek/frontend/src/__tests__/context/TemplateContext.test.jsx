import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

/**
 * Three defects found in the 2026-09-05 going-over, all in the same file.
 *
 * 1. Every splice compared `t._id`. The gateway returns templates keyed by
 *    `id`, so `_id` was always `undefined`: deleting a template left it on
 *    screen and editing one showed no change until the next page load.
 * 2. `search` and `tags` were handed to `apolloClient.query` as variables the
 *    `templates(type:, isDefault:)` operation never declares, so they were
 *    silently dropped. The "Search templates…" box refetched the identical
 *    list on every keystroke and filtered nothing.
 * 3. Because the effect was keyed on the whole `filters` object, every one of
 *    those keystrokes fired a `network-only` GraphQL query.
 */

const getTemplates = vi.fn();
const deleteTemplateApi = vi.fn();
const updateTemplateApi = vi.fn();

vi.mock('../../services/templateService', () => ({
  default: {
    getTemplates: (...args) => getTemplates(...args),
    createTemplate: vi.fn(),
    updateTemplate: (...args) => updateTemplateApi(...args),
    deleteTemplate: (...args) => deleteTemplateApi(...args),
    applyTemplate: vi.fn(),
    getTemplateTypes: () => ({ daily: 'Daily Log', custom: 'Custom' }),
  },
}));

vi.mock('../../apolloClient', () => ({
  apolloClient: { mutate: vi.fn(), query: vi.fn() },
}));

import { TemplateProvider, useTemplates } from '../../context/TemplateContext';

const TEMPLATES = [
  { id: 'a', name: 'Morning standup', type: 'daily', tags: ['work'], content: 'one\ntwo' },
  { id: 'b', name: 'Grocery run', type: 'custom', tags: ['home'], content: 'milk' },
];

let api;
function Probe() {
  api = useTemplates();
  return (
    <ul>
      {api.templates.map((t) => (
        <li key={t.id}>{t.name}</li>
      ))}
    </ul>
  );
}

function renderProvider() {
  return render(
    <TemplateProvider>
      <Probe />
    </TemplateProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getTemplates.mockResolvedValue(TEMPLATES);
});

describe('TemplateContext', () => {
  it('removes a deleted template from the list (it matched on `_id`, which is never there)', async () => {
    deleteTemplateApi.mockResolvedValue({ success: true });
    renderProvider();
    await screen.findByText('Grocery run');

    await act(async () => {
      await api.deleteTemplate('b');
    });

    await waitFor(() => {
      expect(screen.queryByText('Grocery run')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Morning standup')).toBeInTheDocument();
  });

  it('replaces an edited template in the list', async () => {
    updateTemplateApi.mockResolvedValue({ ...TEMPLATES[0], name: 'Morning ritual' });
    renderProvider();
    await screen.findByText('Morning standup');

    await act(async () => {
      await api.updateTemplate('a', { name: 'Morning ritual' });
    });

    await waitFor(() => {
      expect(screen.getByText('Morning ritual')).toBeInTheDocument();
    });
    expect(screen.queryByText('Morning standup')).not.toBeInTheDocument();
  });

  it('actually filters on `search`, which the server never saw', async () => {
    renderProvider();
    await screen.findByText('Grocery run');

    await act(async () => {
      api.updateFilters({ search: 'grocery' });
    });

    await waitFor(() => {
      expect(screen.queryByText('Morning standup')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Grocery run')).toBeInTheDocument();
  });

  it('does not refetch for a filter the server cannot apply', async () => {
    renderProvider();
    await screen.findByText('Grocery run');
    const callsAfterLoad = getTemplates.mock.calls.length;

    await act(async () => {
      api.updateFilters({ search: 'g' });
    });
    await act(async () => {
      api.updateFilters({ search: 'gr' });
    });

    expect(getTemplates.mock.calls.length).toBe(callsAfterLoad);
  });

  it('does refetch when `type` changes, which the server does apply', async () => {
    renderProvider();
    await screen.findByText('Grocery run');
    const callsAfterLoad = getTemplates.mock.calls.length;

    await act(async () => {
      api.updateFilters({ type: 'daily' });
    });

    await waitFor(() => {
      expect(getTemplates.mock.calls.length).toBe(callsAfterLoad + 1);
    });
    expect(getTemplates).toHaveBeenLastCalledWith({ type: 'daily' });
  });
});
