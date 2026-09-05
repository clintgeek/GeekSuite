import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatRelativeTime } from '../../utils/dateUtils';

// Fixed "now" so every threshold is deterministic.
const NOW = new Date('2026-09-05T12:00:00.000Z');

function ago(ms) {
    return new Date(NOW.getTime() - ms).toISOString();
}

describe('formatRelativeTime', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns "just now" for under a minute', () => {
        expect(formatRelativeTime(ago(0))).toBe('just now');
        expect(formatRelativeTime(ago(59 * 1000))).toBe('just now');
    });

    it('returns minutes for 1–59 minutes', () => {
        expect(formatRelativeTime(ago(60 * 1000))).toBe('1m ago');
        expect(formatRelativeTime(ago(5 * 60 * 1000))).toBe('5m ago');
        expect(formatRelativeTime(ago(59 * 60 * 1000))).toBe('59m ago');
    });

    it('returns hours for 1–23 hours', () => {
        expect(formatRelativeTime(ago(60 * 60 * 1000))).toBe('1h ago');
        expect(formatRelativeTime(ago(3 * 60 * 60 * 1000))).toBe('3h ago');
        expect(formatRelativeTime(ago(23 * 60 * 60 * 1000))).toBe('23h ago');
    });

    it('returns days for 1–6 days', () => {
        expect(formatRelativeTime(ago(24 * 3600 * 1000))).toBe('1d ago');
        expect(formatRelativeTime(ago(2 * 24 * 3600 * 1000))).toBe('2d ago');
        expect(formatRelativeTime(ago(6 * 24 * 3600 * 1000))).toBe('6d ago');
    });

    it('returns weeks for 7–29 days', () => {
        expect(formatRelativeTime(ago(7 * 24 * 3600 * 1000))).toBe('1w ago');
        expect(formatRelativeTime(ago(14 * 24 * 3600 * 1000))).toBe('2w ago');
        expect(formatRelativeTime(ago(29 * 24 * 3600 * 1000))).toBe('4w ago');
    });

    it('falls back to a short date at 30+ days', () => {
        const then = new Date(NOW.getTime() - 30 * 24 * 3600 * 1000);
        const expected = then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        expect(formatRelativeTime(then.toISOString())).toBe(expected);
    });

    it('accepts a Date instance as well as a string', () => {
        const then = new Date(NOW.getTime() - 5 * 60 * 1000);
        expect(formatRelativeTime(then)).toBe('5m ago');
    });
});
