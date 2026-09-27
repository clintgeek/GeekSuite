import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import ThemeModeProvider from '../../../theme/ThemeModeProvider';
import HandwrittenEditor from '../../../components/editors/HandwrittenEditor';

const AllProviders = ({ children }) => (
    <ThemeModeProvider>
        <MantineProvider>
            <MemoryRouter>{children}</MemoryRouter>
        </MantineProvider>
    </ThemeModeProvider>
);

// A tldraw mock that behaves like tldraw 2.4 where it matters. The previous
// mock let useEditor() work anywhere and accepted any argument, so it could
// not catch the 2026-09-26 bugs: the phone toolbar calling useEditor() outside
// <Tldraw> (a crash on every phone), updateViewportScreenBounds(element) (it
// wants a Box), the retired isDarkMode preference, and inline options and
// components objects that made tldraw rebuild its editor on every render.
const tl = vi.hoisted(() => ({ renders: [], editors: [] }));

vi.mock('@tldraw/tldraw', async () => {
    const React = await import('react');
    const EditorContext = React.createContext(null);

    class Box {
        constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); }
        equals(o) { return !!o && o.x === this.x && o.y === this.y && o.w === this.w && o.h === this.h; }
    }

    const makeEditor = () => {
        const editor = {
            unsubscribes: [],
            listeners: [],
            getCurrentToolId: vi.fn(() => 'draw'),
            getCanUndo: vi.fn(() => false),
            setCurrentTool: vi.fn(),
            undo: vi.fn(),
            updateViewportScreenBounds: vi.fn((b) => {
                // tldraw 2.4 calls screenBounds.equals(...) straight away.
                if (!b || typeof b.equals !== 'function') throw new TypeError('e.equals is not a function');
            }),
            user: {
                updateUserPreferences: vi.fn((prefs) => {
                    if ('isDarkMode' in prefs) throw new Error('ValidationError: At isDarkMode: Unexpected property');
                }),
            },
            store: {
                listen: vi.fn((fn) => {
                    editor.listeners.push(fn);
                    const off = vi.fn();
                    editor.unsubscribes.push(off);
                    return off;
                }),
                getSnapshot: vi.fn(() => ({ store: {}, schema: {} })),
                loadSnapshot: vi.fn(),
            },
        };
        return editor;
    };

    function Tldraw({ onMount, options, components, children }) {
        tl.renders.push({ options, components });
        // Like tldraw: the editor is rebuilt, and onMount runs again, whenever
        // options or components change identity.
        const editor = React.useMemo(() => {
            const e = makeEditor();
            tl.editors.push(e);
            return e;
        }, [options, components]);
        React.useEffect(() => { onMount?.(editor); }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps
        return (
            <EditorContext.Provider value={editor}>
                <div data-testid="tldraw-mock" className="tl-container">{children}</div>
            </EditorContext.Provider>
        );
    }

    const useEditor = () => {
        const editor = React.useContext(EditorContext);
        if (!editor) throw new Error('useEditor must be used inside of the <Tldraw /> or <TldrawEditor /> components');
        return editor;
    };

    return { Tldraw, useEditor, useValue: (_name, fn) => fn(), Box };
});

const observers = [];
global.ResizeObserver = class ResizeObserver {
    constructor(cb) { this.cb = cb; observers.push(this); }
    observe() { }
    unobserve() { }
    disconnect() { }
};

const setViewport = (phone) => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
        // MUI's down('md') is "(max-width:899.95px)": phones match it.
        matches: phone && /max-width/.test(query),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
};

describe('HandwrittenEditor', () => {
    let setContent;
    const realMatchMedia = window.matchMedia;

    beforeEach(() => {
        setContent = vi.fn();
        tl.renders.length = 0;
        tl.editors.length = 0;
        observers.length = 0;
        setViewport(false);
    });
    afterEach(() => { window.matchMedia = realMatchMedia; });

    it('renders on desktop without the editor failing', async () => {
        render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
        expect(await screen.findByTestId('tldraw-mock')).toBeInTheDocument();
        expect(screen.queryByText(/failed to load/i)).not.toBeInTheDocument();
    });

    it('renders the phone drawing toolbar inside <Tldraw> (it calls useEditor)', async () => {
        setViewport(true);
        render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
        expect(await screen.findByRole('button', { name: 'Write' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
        expect(screen.queryByText(/failed to load/i)).not.toBeInTheDocument();
    });

    it('keeps <Tldraw> options and components stable across re-renders, so the editor is built once', async () => {
        const { rerender } = render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
        await screen.findByTestId('tldraw-mock');
        rerender(<HandwrittenEditor content="" setContent={setContent} />);
        rerender(<HandwrittenEditor content="" setContent={setContent} />);
        expect(tl.renders.length).toBeGreaterThanOrEqual(3);
        expect(new Set(tl.renders.map((r) => r.options)).size).toBe(1);
        expect(new Set(tl.renders.map((r) => r.components)).size).toBe(1);
        expect(tl.editors).toHaveLength(1);
    });

    it('drops the previous store listener when onMount runs again', async () => {
        // Switching between phone and desktop layouts legitimately swaps the
        // components object, which rebuilds tldraw's editor.
        const { rerender } = render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
        await screen.findByTestId('tldraw-mock');
        setViewport(true);
        await act(async () => { window.dispatchEvent(new Event('resize')); });
        rerender(<HandwrittenEditor content="" setContent={setContent} />);
        await screen.findByRole('button', { name: 'Write' });
        expect(tl.editors.length).toBeGreaterThanOrEqual(2);
        expect(tl.editors[0].unsubscribes[0]).toHaveBeenCalledTimes(1);
        const live = tl.editors.flatMap((e) => e.unsubscribes).filter((off) => off.mock.calls.length === 0);
        expect(live).toHaveLength(1);
    });

    it('sets the colour scheme with colorScheme, not the retired isDarkMode', async () => {
        render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
        await screen.findByTestId('tldraw-mock');
        const calls = tl.editors[0].user.updateUserPreferences.mock.calls.map(([p]) => p);
        expect(calls.length).toBeGreaterThan(0);
        for (const prefs of calls) {
            expect(prefs).not.toHaveProperty('isDarkMode');
            expect(['light', 'dark']).toContain(prefs.colorScheme);
        }
    });

    it('passes the viewport a Box, not the container element', async () => {
        render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
        await screen.findByTestId('tldraw-mock');
        // The same updateBounds runs on window scroll (the ResizeObserver path
        // defers it to requestAnimationFrame).
        act(() => { window.dispatchEvent(new Event('scroll')); });
        const bounds = tl.editors[0].updateViewportScreenBounds;
        expect(bounds).toHaveBeenCalled();
        expect(bounds).toHaveReturned();
        expect(typeof bounds.mock.calls[0][0].equals).toBe('function');
    });

    it('saves a drawing: a store change reaches setContent', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
            await screen.findByTestId('tldraw-mock');
            const editor = tl.editors.at(-1);
            editor.store.getSnapshot.mockReturnValue({ store: { 'shape:1': { typeName: 'shape' } }, schema: {} });
            act(() => { editor.listeners.at(-1)(); });
            await act(async () => { vi.advanceTimersByTime(1000); });
            expect(setContent).toHaveBeenCalledWith(expect.stringContaining('shape:1'));
        } finally {
            vi.useRealTimers();
        }
    });
});
