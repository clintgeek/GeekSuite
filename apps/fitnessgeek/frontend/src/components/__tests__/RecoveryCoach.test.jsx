/**
 * Health › Recovery.
 *
 * "Get Full AI Analysis" was wired to a native `alert('...coming soon')` — a
 * blocking browser alert over a feature that doesn't exist. It was removed
 * and must stay removed.
 *
 * The panel also called itself "Recovery notes from the AI". The notes are
 * worked out by fixed rules on the server; no model writes them, so the
 * heading is gone. And a failed read used to be folded into "Nothing to go on
 * yet", which is what a day without data says.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const getRecoveryRecommendations = vi.fn();
vi.mock('../../services/influxService', () => ({
  influxService: { getRecoveryRecommendations: (...a) => getRecoveryRecommendations(...a), getRecoveryContext: vi.fn() },
}));

const { default: RecoveryCoach } = await import('../RecoveryCoach.jsx');

const answer = (over = {}) => ({ available: true, readinessScore: 75, recommendations: [], context: {}, ...over });

beforeEach(() => {
  getRecoveryRecommendations.mockReset();
  getRecoveryRecommendations.mockResolvedValue(answer());
});

describe('RecoveryCoach', () => {
  it('never renders "Get Full AI Analysis", even when a handler is passed', async () => {
    render(<RecoveryCoach date="2026-09-19" onRequestAIAnalysis={vi.fn()} />);
    await screen.findByText('Ready-for-today score');
    expect(screen.queryByRole('button', { name: /Get Full AI Analysis/i })).toBeNull();
  });

  it('does not claim an AI wrote rule-based notes, and says what the score is', async () => {
    render(<RecoveryCoach date="2026-09-19" />);
    await screen.findByText('Ready-for-today score');
    expect(screen.queryByText(/from the AI/i)).toBeNull();
    expect(screen.getByText(/A 0–100 guess at how recovered you are/)).toBeInTheDocument();
    expect(screen.getByText('Recovered. A moderate to hard workout suits today.')).toBeInTheDocument();
  });

  it('a failed read says so with a retry, not "Nothing to go on yet"', async () => {
    getRecoveryRecommendations.mockRejectedValueOnce(new Error('Request failed with status code 500'));
    render(<RecoveryCoach date="2026-09-19" />);
    expect(await screen.findByText('Couldn’t load your recovery notes')).toBeInTheDocument();
    expect(screen.queryByText('Nothing to go on yet')).toBeNull();
    expect(screen.queryByText(/status code/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Ready-for-today score')).toBeInTheDocument();
  });

  it('the data server being down is a failure too', async () => {
    getRecoveryRecommendations.mockResolvedValue({ available: false, reason: 'influx_unavailable', message: 'InfluxDB is unavailable' });
    render(<RecoveryCoach date="2026-09-19" />);
    expect(await screen.findByText('Couldn’t load your recovery notes')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/InfluxDB/);
  });

  it('a day with nothing to go on says so in plain words', async () => {
    getRecoveryRecommendations.mockResolvedValue({ available: false, recommendations: [] });
    render(<RecoveryCoach date="2026-09-19" />);
    expect(await screen.findByText('Nothing to go on yet')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/home data server|InfluxDB/i);
  });

  it('a partial record (no list, no context) does not crash', async () => {
    getRecoveryRecommendations.mockResolvedValue({ available: true, readinessScore: 42 });
    render(<RecoveryCoach date="2026-09-19" />);
    expect(await screen.findByText('Ready-for-today score')).toBeInTheDocument();
    expect(screen.getByText('Nothing stands out today. Keep doing what you’re doing.')).toBeInTheDocument();
    expect(screen.getByText('Stay hydrated')).toBeInTheDocument();
  });
});
