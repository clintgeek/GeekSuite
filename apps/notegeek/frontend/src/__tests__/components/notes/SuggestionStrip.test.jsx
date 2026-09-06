import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../testUtils';
import SuggestionStrip from '../../../components/notes/SuggestionStrip';
import { dismissKey } from '../../../utils/suggestions';
import { SUGGEST_FOR_NOTE } from '../../../graphql/queries';

/**
 * SuggestionStrip — DOCS/AI_IDEAS.md #3.
 *
 * The rules worth a test are the product ones, not the rendering:
 *
 *   - off by default: no strip, and no query at all;
 *   - a tap PROPOSES — it calls back into the editor, it never writes;
 *   - a note whose body is a serialized snapshot gets tags and no links,
 *     because a markdown link spliced into that JSON destroys the note;
 *   - the provenance line appears only when a model was actually consulted;
 *   - dismissal is remembered per note.
 */

const VARIABLES = {
  noteId: 'n1',
  title: 'nginx proxy',
  excerpt: 'body text',
  tags: [],
};

const PROVENANCE_LOCAL = {
  source: 'fallback',
  reason: 'opt-out',
  model: null,
  provider: null,
  cached: false,
  callsToday: 0,
  cap: 30,
};

function makeMock(provenance = PROVENANCE_LOCAL, variables = VARIABLES) {
  return {
    request: { query: SUGGEST_FOR_NOTE, variables },
    result: {
      data: {
        suggestForNote: {
          tags: [{ tag: 'homelab', score: 0.42 }],
          related: [{ id: 'r1', title: 'nginx layout', score: 0.31, why: null }],
          provenance,
        },
      },
    },
  };
}

const defaults = {
  enabled: true,
  noteId: 'n1',
  title: 'nginx proxy',
  content: 'body text',
  noteType: 'markdown',
  tags: [],
  saveToken: 1,
};

beforeEach(() => {
  sessionStorage.clear();
});

describe('SuggestionStrip', () => {
  it('renders nothing and asks nothing when the setting is off', async () => {
    const { container } = renderWithProviders(
      <SuggestionStrip {...defaults} enabled={false} />,
      { mocks: [makeMock()] }
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows tag and related chips after a save', async () => {
    renderWithProviders(<SuggestionStrip {...defaults} />, { mocks: [makeMock()] });
    expect(await screen.findByRole('button', { name: /homelab/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nginx layout/ })).toBeInTheDocument();
  });

  it('a tap proposes: it calls back and writes nothing itself', async () => {
    const onApplyTag = vi.fn();
    const onInsertLink = vi.fn();
    renderWithProviders(
      <SuggestionStrip {...defaults} onApplyTag={onApplyTag} onInsertLink={onInsertLink} />,
      { mocks: [makeMock()] }
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /homelab/ }));
    expect(onApplyTag).toHaveBeenCalledWith('homelab');

    await user.click(screen.getByRole('button', { name: /nginx layout/ }));
    expect(onInsertLink).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r1', title: 'nginx layout' })
    );
  });

  it('offers tags but no links on a note whose body is a snapshot', async () => {
    // A mind map's body is serialized tldraw/reactflow JSON, so it is ranked on
    // its title alone and never gets a markdown link spliced into it.
    const variables = { ...VARIABLES, excerpt: '' };
    renderWithProviders(
      <SuggestionStrip {...defaults} noteType="mindmap" content='{"nodes":[]}' />,
      { mocks: [makeMock(PROVENANCE_LOCAL, variables)] }
    );
    expect(await screen.findByRole('button', { name: /homelab/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nginx layout/ })).not.toBeInTheDocument();
  });

  it('says which model ranked the links, and only when one did', async () => {
    const { unmount } = renderWithProviders(<SuggestionStrip {...defaults} />, {
      mocks: [makeMock()],
    });
    await screen.findByRole('button', { name: /homelab/ });
    expect(screen.queryByText(/ranked by/)).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<SuggestionStrip {...defaults} />, {
      mocks: [makeMock({ ...PROVENANCE_LOCAL, source: 'model', reason: null, model: 'llama-3.1-8b', provider: 'groq', callsToday: 1 })],
    });
    expect(await screen.findByText('related notes ranked by llama-3.1-8b')).toBeInTheDocument();
  });

  it('dismissal is remembered for that note', async () => {
    renderWithProviders(<SuggestionStrip {...defaults} />, { mocks: [makeMock()] });
    const user = userEvent.setup();
    await screen.findByRole('button', { name: /homelab/ });
    await user.click(screen.getByRole('button', { name: 'Dismiss suggestions' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /homelab/ })).not.toBeInTheDocument();
    });
    expect(sessionStorage.getItem(dismissKey('n1'))).toBe('1');
  });
});
