import { describe, it, expect } from 'vitest';
import {
    barChrome, barMode, shortBarWidth, tightBarWidth, BAR_EDGE_MARGIN, SHORT_BAR_BUTTONS, TIGHT_BAR_BUTTONS,
} from '../../../components/editors/DrawingToolbar';

/**
 * The phone's short sketch bar must fit the phone (2026-11-15).
 *
 * Eraser and More joined it (review 2.5), which took it to eight 44px
 * buttons: 386px of content in the 374px a 390px phone leaves the bar, so
 * Fullscreen sat half off the right edge of the screen. jsdom lays nothing
 * out, so the arithmetic the bar is built from is what is tested here; the
 * mobile harness (notegeek 22a-sketch-more) measures the real thing.
 */
describe('the short sketch bar fits a phone', () => {
    it('is no wider than a 390px phone leaves it, with 44px buttons', () => {
        expect(shortBarWidth(44)).toBeLessThanOrEqual(390 - BAR_EDGE_MARGIN);
    });

    it('does not get there by shrinking the tap targets', () => {
        // Whatever the chrome is, the buttons alone are 8 x 44.
        const chromeOnly = shortBarWidth(44) - SHORT_BAR_BUTTONS * 44;
        expect(chromeOnly).toBeGreaterThanOrEqual(0);
        expect(chromeOnly).toBeLessThanOrEqual(390 - BAR_EDGE_MARGIN - SHORT_BAR_BUTTONS * 44);
    });

    it('leaves the full bar its air', () => {
        expect(barChrome(true)).toEqual({ gap: 2, pad: 6 });
        expect(barChrome(false).gap).toBeLessThan(barChrome(true).gap);
    });
});

/**
 * Narrower phones (2026-11-15): under 388px the short bar no longer fits, and
 * it used to scroll sideways with More and Fullscreen starting off-screen.
 * Those sizes get the tight bar: Paper and Fullscreen move into More.
 */
describe('the tight sketch bar, for phones narrower than the short bar', () => {
    it('is chosen exactly where the short bar stops fitting', () => {
        const edge = shortBarWidth(44) + BAR_EDGE_MARGIN;
        expect(barMode(edge, 800)).toBe('short');
        expect(barMode(edge - 1, 800)).toBe('tight');
        expect(barMode(390, 800)).toBe('short');
        expect(barMode(375, 800)).toBe('tight');
        expect(barMode(360, 800)).toBe('tight');
        expect(barMode(800, 800)).toBe('full');
    });

    it('stays short, not tight, before the container is measured', () => {
        expect(barMode(0, 800)).toBe('short');
    });

    it('fits a 320px phone with 44px buttons', () => {
        expect(tightBarWidth(44)).toBeLessThanOrEqual(320 - BAR_EDGE_MARGIN);
        expect(tightBarWidth(44)).toBeGreaterThanOrEqual(TIGHT_BAR_BUTTONS * 44);
    });
});
