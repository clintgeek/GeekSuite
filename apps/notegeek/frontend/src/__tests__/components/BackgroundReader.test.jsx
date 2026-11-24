/**
 * BackgroundReader: a waiting sketch is mounted off-screen in the note
 * editor (read-only, never focused), exported, sent, and unmounted.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const mounted = vi.hoisted(() => []);
vi.mock('../../apolloClient', () => ({ apolloClient: {} }));
vi.mock('../../components/editors/HandwrittenEditor', () => ({
  default: function FakeEditor(props) {
    mounted.push(props);
    React.useEffect(() => {
      if (props.content === 'broken') return;
      props.sketchApiRef.current = {
        hasShapes: () => props.content !== 'blank',
        exportPng: async () => ({ base64: `png:${props.content}`, mediaType: 'image/png' }),
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return <div data-testid="hidden-editor" />;
  },
}));

import BackgroundReader, { RENDER_TIMEOUT_MS, SETTLE_MS } from '../../components/BackgroundReader';
const FIRST_PASS_MS = 15_000;

const opName = (doc) => doc.definitions[0].name.value;
function client(content) {
  const sent = [];
  return {
    sent,
    query: vi.fn(async ({ query, variables }) => (opName(query) === 'SketchesToTranscribe'
      ? { data: { sketchesToTranscribe: sent.length ? [] : ['n1'] } }
      : { data: { note: { id: variables.id, type: 'handwritten', content } } })),
    mutate: vi.fn(async ({ variables }) => {
      sent.push(variables);
      return { data: { autoTranscribeSketch: { status: 'searchable' } } };
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  mounted.length = 0;
});
afterEach(() => vi.useRealTimers());

/** Run the clock, and let the lazy editor's import (a real promise) land. */
const settle = async (ms) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);
  });
};

describe('BackgroundReader', () => {
  it('renders nothing until there is a page to draw', async () => {
    const { container } = render(<BackgroundReader client={client('ink')} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('draws a waiting sketch off-screen, read-only and unfocused, sends the image, and unmounts it', async () => {
    const c = client('ink');
    render(<BackgroundReader client={c} />);
    await settle(FIRST_PASS_MS);
    await settle(0);
    const host = screen.getByTestId('background-reader');
    expect(host).toHaveAttribute('aria-hidden', 'true');
    expect(host).toHaveAttribute('inert');
    expect(mounted[0]).toMatchObject({ content: 'ink', readOnly: true, autoFocus: false });
    expect(mounted[0].setContent).toBeUndefined();
    await settle(SETTLE_MS);
    await settle(0);
    expect(c.sent).toEqual([{ noteId: 'n1', image: 'png:ink', mediaType: 'image/png' }]);
    expect(screen.queryByTestId('background-reader')).toBeNull();
  });

  it('a page with no ink on it is not sent', async () => {
    const c = client('blank');
    render(<BackgroundReader client={c} />);
    await settle(FIRST_PASS_MS);
    await settle(SETTLE_MS);
    await settle(0);
    expect(c.sent).toEqual([]);
    expect(screen.queryByTestId('background-reader')).toBeNull();
  });

  it('an editor that never hands over a page is given up on, and taken off the page', async () => {
    const c = client('broken');
    render(<BackgroundReader client={c} />);
    await settle(FIRST_PASS_MS);
    await settle(0);
    expect(screen.getByTestId('background-reader')).toBeInTheDocument();
    await settle(RENDER_TIMEOUT_MS);
    expect(c.sent).toEqual([]);
    expect(screen.queryByTestId('background-reader')).toBeNull();
  });
});

describe("today's spending limit", () => {
  it('is said once, in words, when a read fails because of it', async () => {
    const { GeekToastProvider } = await import('@geeksuite/ui');
    const { reportReadLimit } = await import('@geeksuite/api-client');
    window.localStorage.clear();
    render(<GeekToastProvider><BackgroundReader client={client('ink')} /></GeekToastProvider>);
    const spent = { status: 'retry', errorCode: 'AI_BUDGET', retryAt: null };
    await act(async () => { reportReadLimit(spent); });
    expect(screen.getByText(/Today's AI spending limit is used up/)).toBeTruthy();
    await act(async () => { reportReadLimit(spent); });
    expect(screen.getAllByText(/Today's AI spending limit is used up/)).toHaveLength(1);
  });
});
