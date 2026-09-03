/**
 * Feedback primitive smoke tests (TODO_ORDER #15 / #19).
 *
 * Same constraints as `navigation.test.jsx`: the vitest environment is `node`,
 * so these render to static markup with `react-dom/server` and assert on
 * presence, order and the `data-geek-*` hooks. What is locked here is rules,
 * not looks:
 *
 *   - the empty state renders title, description and action, and its action
 *     band pins the 44px target even if an app theme shrinks buttons;
 *   - the error state shows the *message* of an Error and never its stack, and
 *     grows a "Try again" button only when `onRetry` is passed;
 *   - `GeekToastProvider` mounts and renders its children with no DOM and no
 *     shell around it (an SSR pass must not explode), and shows nothing until
 *     something is notified;
 *   - `toneForMode` lifts in dark and deepens in light, and honors a `0`.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { getLuminance } from '@mui/material/styles';
import Button from '@mui/material/Button';

import { GeekEmptyState } from '../feedback/GeekEmptyState.jsx';
import { GeekErrorState } from '../feedback/GeekErrorState.jsx';
import { GeekToastProvider } from '../feedback/GeekToastProvider.jsx';
import { toneForMode } from '../color.js';
import { geekLayout } from '../designTokens.js';

describe('GeekEmptyState', () => {
  it('renders icon, title, description and action', () => {
    const markup = renderToStaticMarkup(
      <GeekEmptyState
        icon={<span data-test-ornament>· · ·</span>}
        title="Backlog is empty"
        description="Everything is accounted for."
        action={<Button variant="outlined">Add one</Button>}
      />
    );

    expect(markup).toContain('data-geek-empty-state');
    expect(markup).toContain('Backlog is empty');
    expect(markup).toContain('Everything is accounted for.');
    expect(markup).toContain('Add one');
    expect(markup).toContain('data-test-ornament');
    expect(markup).toContain('data-geek-empty-state-title');
    expect(markup).toContain('data-geek-empty-state-description');
    expect(markup).toContain('data-geek-empty-state-action');
  });

  it('omits the description and action bands when not given', () => {
    const markup = renderToStaticMarkup(<GeekEmptyState title="No tasks found" />);

    expect(markup).toContain('No tasks found');
    expect(markup).not.toContain('data-geek-empty-state-description');
    expect(markup).not.toContain('data-geek-empty-state-action');
    expect(markup).not.toContain('data-geek-empty-state-icon');
  });

  it('holds the 44px target on the action band', () => {
    const markup = renderToStaticMarkup(
      <GeekEmptyState title="t" action={<Button>Go</Button>} />
    );

    expect(markup).toContain(`min-height:${geekLayout.minClickTarget}px`);
  });

  it('renders the children slot between description and action', () => {
    const markup = renderToStaticMarkup(
      <GeekEmptyState
        title="t"
        description="d"
        action={<Button>Go</Button>}
      >
        <span data-test-extra>extra</span>
      </GeekEmptyState>
    );

    expect(markup.indexOf('data-geek-empty-state-description')).toBeLessThan(
      markup.indexOf('data-test-extra')
    );
    expect(markup.indexOf('data-test-extra')).toBeLessThan(
      markup.indexOf('data-geek-empty-state-action')
    );
  });
});

describe('GeekErrorState', () => {
  it('renders title, description and an Error message as the detail line', () => {
    const error = new Error('Network request failed');
    error.stack = 'Error: Network request failed\n    at secretInternals (/srv/app.js:12:9)';

    const markup = renderToStaticMarkup(
      <GeekErrorState
        title="Could not load tasks"
        description="The server did not answer."
        error={error}
      />
    );

    expect(markup).toContain('data-geek-error-state');
    expect(markup).toContain('Could not load tasks');
    expect(markup).toContain('The server did not answer.');
    expect(markup).toContain('data-geek-error-state-detail');
    expect(markup).toContain('Network request failed');
    // The detail line is a message, never a stack.
    expect(markup).not.toContain('secretInternals');
    expect(markup).not.toContain('/srv/app.js');
  });

  it('accepts a bare string error and carries a default title', () => {
    const markup = renderToStaticMarkup(<GeekErrorState error="503 from the gateway" />);

    expect(markup).toContain('Something went wrong');
    expect(markup).toContain('503 from the gateway');
  });

  it('renders a retry button only when onRetry is given', () => {
    const without = renderToStaticMarkup(<GeekErrorState error="boom" />);
    expect(without).not.toContain('data-geek-error-state-retry');
    expect(without).not.toContain('data-geek-empty-state-action');

    const withRetry = renderToStaticMarkup(
      <GeekErrorState error="boom" onRetry={() => {}} />
    );
    expect(withRetry).toContain('data-geek-error-state-retry');
    expect(withRetry).toContain('Try again');
  });

  it('renders both the retry and a caller-supplied action', () => {
    const markup = renderToStaticMarkup(
      <GeekErrorState error="boom" onRetry={() => {}} action={<Button>Go back</Button>} />
    );

    expect(markup).toContain('Try again');
    expect(markup).toContain('Go back');
  });

  it('drops the detail line when there is no message to show', () => {
    const markup = renderToStaticMarkup(<GeekErrorState error={{}} />);
    expect(markup).not.toContain('data-geek-error-state-detail');
  });
});

describe('GeekToastProvider', () => {
  it('renders its children under SSR with no DOM and no shell', () => {
    const markup = renderToStaticMarkup(
      <GeekToastProvider>
        <p data-test-child>the app</p>
      </GeekToastProvider>
    );

    expect(markup).toContain('data-test-child');
    expect(markup).toContain('the app');
  });

  it('renders no toast surface until something is notified', () => {
    const markup = renderToStaticMarkup(
      <GeekToastProvider>
        <p>the app</p>
      </GeekToastProvider>
    );

    // MUI's Snackbar renders nothing while closed.
    expect(markup).not.toContain('data-geek-toast=');
  });
});

describe('toneForMode', () => {
  const color = '#B00020';

  it('lightens in dark mode and darkens in light mode', () => {
    const dark = toneForMode(color, { palette: { mode: 'dark' } });
    const light = toneForMode(color, { palette: { mode: 'light' } });

    expect(dark).not.toBe(color);
    expect(light).not.toBe(color);
    expect(getLuminance(dark)).toBeGreaterThan(getLuminance(color));
    expect(getLuminance(light)).toBeLessThan(getLuminance(color));
  });

  it('accepts a bare mode string', () => {
    expect(toneForMode(color, 'dark')).toBe(toneForMode(color, { palette: { mode: 'dark' } }));
  });

  it('honors custom amounts, and leaves a mode untouched at 0', () => {
    const gentle = toneForMode(color, 'dark', { lightenBy: 0.1 });
    const strong = toneForMode(color, 'dark', { lightenBy: 0.6 });
    expect(getLuminance(strong)).toBeGreaterThan(getLuminance(gentle));

    // The bujogeek call sites only ever needed the dark lift.
    expect(toneForMode(color, 'light', { darkenBy: 0 })).toBe(color);
    expect(toneForMode(color, 'dark', { lightenBy: 0 })).toBe(color);
  });

  it('passes through a missing color and an unknown mode', () => {
    expect(toneForMode(undefined, 'dark')).toBe(undefined);
    expect(toneForMode('', 'dark')).toBe('');
    // No mode at all behaves as light — the default MUI mode.
    expect(toneForMode(color, {})).toBe(toneForMode(color, 'light'));
  });
});
