import { vi, describe, it, expect, beforeEach } from 'vitest';
import { registerReset, reset } from '../../utils/resetUserStore';

describe('resetUserStore utils', () => {
    beforeEach(() => {
        // We can "reset" the internal state by registering null
        registerReset(null);
    });

    it('should call registered callback when reset is called', () => {
        const mockCallback = vi.fn();
        registerReset(mockCallback);

        reset();

        expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('should do nothing if no callback is registered', () => {
        expect(() => reset()).not.toThrow();
    });

    it('should overwrite old callback with a new one', () => {
        const mockCallback1 = vi.fn();
        const mockCallback2 = vi.fn();

        registerReset(mockCallback1);
        registerReset(mockCallback2);

        reset();

        expect(mockCallback1).not.toHaveBeenCalled();
        expect(mockCallback2).toHaveBeenCalledTimes(1);
    });
});
