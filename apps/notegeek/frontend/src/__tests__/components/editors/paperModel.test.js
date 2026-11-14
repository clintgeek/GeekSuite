import { describe, it, expect } from 'vitest';
import { paperFromMeta, readDevicePaper, resolvePaper, rulingStyle, writeDevicePaper, SPACING } from '../../../components/editors/paperModel';

const memoryStorage = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};

describe('sketch paper', () => {
    it('every paper but Match theme is light, so black ink stays black even in dark mode', () => {
        for (const color of ['white', 'warm', 'grey', 'green']) {
            expect(resolvePaper({ color, pattern: 'plain' }, 'dark').colorScheme).toBe('light');
        }
        expect(resolvePaper({ color: 'auto', pattern: 'plain' }, 'dark')).toMatchObject({ colorScheme: 'dark', background: null });
        expect(resolvePaper({ color: 'auto', pattern: 'plain' }, 'light').colorScheme).toBe('light');
    });

    it("the sketch's own paper wins per field; unknown values fall back", () => {
        const device = { color: 'warm', pattern: 'lined' };
        expect(paperFromMeta({}, device)).toEqual(device);
        expect(paperFromMeta({ paperColor: 'green' }, device)).toEqual({ color: 'green', pattern: 'lined' });
        expect(paperFromMeta({ paperColor: 'plaid', paperPattern: 'graph' }, device)).toEqual({ color: 'warm', pattern: 'graph' });
    });

    it("the device default survives a round trip and shrugs off junk", () => {
        const store = memoryStorage();
        expect(readDevicePaper(store)).toEqual({ color: 'auto', pattern: 'plain' });
        writeDevicePaper({ color: 'grey', pattern: 'dots' }, store);
        expect(readDevicePaper(store)).toEqual({ color: 'grey', pattern: 'dots' });
        store.setItem('notegeek:sketchPaper', '{not json');
        expect(readDevicePaper(store)).toEqual({ color: 'auto', pattern: 'plain' });
        expect(readDevicePaper({ getItem: () => { throw new Error('denied'); } })).toEqual({ color: 'auto', pattern: 'plain' });
    });

    it('the ruling zooms and pans with the camera', () => {
        const line = 'rgba(0, 0, 0, 0.2)';
        expect(rulingStyle('plain', line, { x: 0, y: 0, z: 1 })).toEqual({});
        const lined = rulingStyle('lined', line, { x: 0, y: 10, z: 2 });
        expect(lined.backgroundSize).toBe(`100% ${SPACING.lined * 2}px`);
        expect(lined.backgroundPosition).toBe(`0px 20px`);
        // A page point p is drawn at (p + camera) * z, so a negative camera wraps.
        expect(rulingStyle('dots', line, { x: -5, y: 0, z: 1 }).backgroundPosition).toBe(`${SPACING.dots - 5}px 0px`);
        expect(rulingStyle('graph', line, { x: 0, y: 0, z: 1 }).backgroundImage.split('linear-gradient')).toHaveLength(5);
    });

    it('zoomed far out, the ruling thins and then goes, rather than greying the page', () => {
        const line = 'rgba(0, 0, 0, 0.2)';
        // Graph minor lines go first, the major ones stay.
        expect(rulingStyle('graph', line, { x: 0, y: 0, z: 0.2 }).backgroundImage.split('linear-gradient')).toHaveLength(3);
        expect(rulingStyle('graph', line, { x: 0, y: 0, z: 0.05 })).toEqual({});
        expect(rulingStyle('lined', line, { x: 0, y: 0, z: 0.1 })).toEqual({});
    });
});
