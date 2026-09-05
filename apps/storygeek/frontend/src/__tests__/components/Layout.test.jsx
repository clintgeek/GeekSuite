import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import Layout from '../../components/Layout';

// Layout's own job is thin: hand `fill` to GeekAppFrame and wire Sidebar/TopBar
// into GeekShell's nav/topBar slots. Sidebar and TopBar pull in useAuth,
// useThemeMode and GeekShell context that this test doesn't care about, so
// they're mocked to trivial placeholders — the behavior under test is the
// `fill` passthrough, not the chrome.
vi.mock('../../components/Sidebar', () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock('../../components/TopBar', () => ({ default: () => <div data-testid="topbar" /> }));

// A faithful-enough double of @geeksuite/ui: GeekShell renders its children
// (the frame) plus the nav/topBar slots so the wiring is still exercised;
// GeekAppFrame reproduces the real component's `fill` hook exactly
// (`data-geek-frame={fill ? 'fill' : undefined}` — see packages/ui/src/navigation/GeekAppFrame.jsx).
vi.mock('@geeksuite/ui', () => ({
  GeekShell: ({ children, nav, topBar }) => (
    <div data-testid="geek-shell">
      {nav}
      {topBar}
      {children}
    </div>
  ),
  GeekAppFrame: ({ children, fill = false }) => (
    <div data-geek-frame={fill ? 'fill' : undefined}>{children}</div>
  ),
}));

describe('Layout', () => {
  it('renders its children, nav and top bar', () => {
    const { getByTestId, getByText } = render(
      <Layout>
        <div>page content</div>
      </Layout>
    );
    expect(getByTestId('sidebar')).toBeInTheDocument();
    expect(getByTestId('topbar')).toBeInTheDocument();
    expect(getByText('page content')).toBeInTheDocument();
  });

  it('does not set the fill hook by default', () => {
    const { container } = render(
      <Layout>
        <div>page content</div>
      </Layout>
    );
    expect(container.querySelector('[data-geek-frame]')).toBeNull();
  });

  it('passes fill through to GeekAppFrame as data-geek-frame="fill"', () => {
    const { container } = render(
      <Layout fill>
        <div>play surface</div>
      </Layout>
    );
    const frame = container.querySelector('[data-geek-frame="fill"]');
    expect(frame).not.toBeNull();
    expect(frame).toHaveTextContent('play surface');
  });
});
