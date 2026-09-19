/**
 * "Get Full AI Analysis" was wired to a native `alert('...coming soon')` in
 * HealthDashboard.jsx — a blocking browser alert, the one place in the app
 * that broke the design language outright, over a feature that doesn't
 * exist. The button (and the onRequestAIAnalysis plumbing that led to it)
 * was removed rather than pointed at a real destination. This test goes red
 * on the pre-fix component (which renders the button whenever a caller
 * passes onRequestAIAnalysis) and green once it's gone for good.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../services/influxService', () => ({
  influxService: {
    getRecoveryRecommendations: vi.fn(() =>
      Promise.resolve({
        available: true,
        readinessScore: 75,
        recommendations: [],
        context: {},
      })
    ),
    getRecoveryContext: vi.fn(),
  },
}));

const { default: RecoveryCoach } = await import('../RecoveryCoach.jsx');

describe('RecoveryCoach — AI Analysis button', () => {
  it('never renders "Get Full AI Analysis", even when a handler is passed', async () => {
    const onRequestAIAnalysis = vi.fn();
    render(<RecoveryCoach date="2026-09-19" onRequestAIAnalysis={onRequestAIAnalysis} />);

    await screen.findByText('AI Recovery Coach');

    expect(screen.queryByRole('button', { name: /Get Full AI Analysis/i })).toBeNull();
  });
});
