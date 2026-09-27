import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import ThemeModeProvider from '../../../theme/ThemeModeProvider';
import HandwrittenEditor from '../../../components/editors/HandwrittenEditor';
import { DefaultColorStyle, DefaultSizeStyle } from '@tldraw/tldraw';
import userEvent from '@testing-library/user-event';

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
//
// The canvas mirrors tldraw's own pointer handling (useCanvasEvents.ts): a
// button-2 press becomes `right_click` and draws nothing; only buttons 0, 1
// and 5 start a pointer_down; pointerup passes 0, 1, 2 and 5. A contextmenu
// that reaches it "opens" tldraw's (Radix) context menu. getPointerInfo is
// tldraw's, field for field. So the S Pen eraser is tested against the
// handlers it has to get around, not against a mock that would accept anything.
const tl = vi.hoisted(() => ({ renders: [], editors: [], contextMenus: [], longPresses: [], exportToBlob: null }));

vi.mock('@tldraw/tldraw', async () => {
    const React = await import('react');
    const EditorContext = React.createContext(null);

    class Box {
        constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); }
        equals(o) { return !!o && o.x === this.x && o.y === this.y && o.w === this.w && o.h === this.h; }
    }

    const DefaultColorStyle = { id: 'tldraw:color' };
    const DefaultSizeStyle = { id: 'tldraw:size' };
    const swatches = Object.fromEntries(['black', 'grey', 'blue', 'light-blue', 'violet', 'light-violet', 'green', 'light-green', 'yellow', 'orange', 'red', 'light-red', 'white'].map((c) => [c, { solid: '#123456' }]));
    const DefaultColorThemePalette = { lightMode: swatches, darkMode: swatches };

    const getPointerInfo = (e) => {
        e.isKilled = true;
        return {
            point: { x: e.clientX, y: e.clientY, z: e.pressure },
            shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.metaKey || e.ctrlKey,
            pointerId: e.pointerId, button: e.button, isPen: e.pointerType === 'pen',
        };
    };

    const makeEditor = () => {
        const styles = new Map([[DefaultColorStyle, 'black'], [DefaultSizeStyle, 'm']]);
        let tool = 'select';
        const editor = {
            // tldraw's tool state chart: `draw` has children idle/drawing, and
            // isIn('draw.drawing') is true only while a stroke is being made.
            toolState: 'idle',
            isIn: vi.fn((path) => path === tool || path === `${tool}.${editor.toolState}`),
            getZoomLevel: vi.fn(() => 1),
            // editor.sideEffects.registerBeforeCreateHandler(typeName, handler) => off
            beforeCreate: [],
            beforeCreateOffs: [],
            sideEffects: {
                registerBeforeCreateHandler: vi.fn((typeName, handler) => {
                    editor.beforeCreate.push({ typeName, handler });
                    const off = vi.fn();
                    editor.beforeCreateOffs.push(off);
                    return off;
                }),
            },
            events: [],
            dispatch: vi.fn((info) => { editor.events.push({ ...info, toolAtDispatch: tool }); return editor; }),
            complete: vi.fn(() => editor),
            getInstanceState: vi.fn(() => ({ isReadonly: false })),
            shapeIds: new Set(),
            getCurrentPageShapeIds: vi.fn(() => editor.shapeIds),
            getCurrentPageBounds: vi.fn(() => (editor.shapeIds.size ? { x: 0, y: 0, w: 900, h: 400 } : undefined)),
            getStyleForNextShape: vi.fn((style) => styles.get(style)),
            setStyleForNextShapes: vi.fn((style, value) => { styles.set(style, value); return editor; }),
            setStyleForSelectedShapes: vi.fn(() => editor),
            unsubscribes: [],
            listeners: [],
            getCurrentToolId: vi.fn(() => tool),
            getCanUndo: vi.fn(() => false),
            setCurrentTool: vi.fn((id) => { tool = id; return editor; }),
            undo: vi.fn(),
            updateViewportScreenBounds: vi.fn((b) => {
                // tldraw 2.4 calls screenBounds.equals(...) straight away.
                if (!b || typeof b.equals !== 'function') throw new TypeError('e.equals is not a function');
            }),
            user: {
                getIsDynamicResizeMode: vi.fn(() => false),
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
                // Like tldraw: loading a snapshot puts its shape records on
                // the page (sorted by index), where the camera can find them.
                loadSnapshot: vi.fn((snap) => {
                    editor.pageShapes = Object.values(snap?.store || {})
                        .filter((r) => r?.typeName === 'shape')
                        .sort((a, b) => String(a.index).localeCompare(String(b.index)));
                }),
            },
            pageShapes: [],
            isDisposed: false,
            getCurrentPageShapesSorted: vi.fn(() => editor.pageShapes),
            getShapePageBounds: vi.fn((shape) => ({ x: shape.x, y: shape.y, w: shape.props?.w ?? 1, h: shape.props?.h ?? 1 })),
            // The camera: session state, not the document.
            zoomToBounds: vi.fn(() => editor),
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
        // tldraw's canvas handlers, as in useCanvasEvents.ts.
        const onPointerDown = (e) => {
            if (e.nativeEvent.isKilled) return;
            if (e.button === 2) {
                editor.dispatch({ type: 'pointer', target: 'canvas', name: 'right_click', ...getPointerInfo(e.nativeEvent) });
                return;
            }
            if (e.button !== 0 && e.button !== 1 && e.button !== 5) return;
            editor.dispatch({ type: 'pointer', target: 'canvas', name: 'pointer_down', ...getPointerInfo(e.nativeEvent) });
        };
        const onPointerUp = (e) => {
            if (e.nativeEvent.isKilled) return;
            if (e.button !== 0 && e.button !== 1 && e.button !== 2 && e.button !== 5) return;
            editor.dispatch({ type: 'pointer', target: 'canvas', name: 'pointer_up', ...getPointerInfo(e.nativeEvent) });
        };
        // Radix's ContextMenu.Trigger, which wraps tldraw's canvas: it opens
        // on contextmenu, and on a 700ms touch or PEN long-press started by
        // pointerdown (skipped if the event was defaultPrevented, as Radix's
        // composeEventHandlers does). It does NOT look at tldraw's isKilled.
        const onContextMenu = (e) => { tl.contextMenus.push(e.nativeEvent); e.preventDefault(); };
        const radixPointerDown = (e) => {
            if (e.defaultPrevented) return;
            if (e.pointerType === 'touch' || e.pointerType === 'pen') tl.longPresses.push(e.nativeEvent);
        };
        return (
            <EditorContext.Provider value={editor}>
                <div data-testid="tldraw-mock" className="tl-container">
                    <div data-testid="tl-canvas" className="tl-canvas" onPointerDown={(e) => { radixPointerDown(e); onPointerDown(e); }} onPointerUp={onPointerUp} onContextMenu={onContextMenu} />
                    {children}
                </div>
            </EditorContext.Provider>
        );
    }

    const useEditor = () => {
        const editor = React.useContext(EditorContext);
        if (!editor) throw new Error('useEditor must be used inside of the <Tldraw /> or <TldrawEditor /> components');
        return editor;
    };

    // tldraw's exportToBlob: ({ editor, ids, format, opts }) => Promise<Blob>.
    tl.exportToBlob = vi.fn(async ({ ids }) => {
        if (!ids?.length) throw new Error('Could not construct SVG.');
        return new Blob(['raw-png'], { type: 'image/png' });
    });
    const exportToBlob = (...args) => tl.exportToBlob(...args);

    return { Tldraw, useEditor, useValue: (_name, fn) => fn(), Box, DefaultColorStyle, DefaultSizeStyle, DefaultColorThemePalette, exportToBlob, getPointerInfo };
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
        tl.contextMenus.length = 0;
        tl.longPresses.length = 0;
        tl.exportToBlob?.mockClear();
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

    it('starts with a small pen', async () => {
        render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
        await screen.findByTestId('tldraw-mock');
        expect(tl.editors[0].setStyleForNextShapes).toHaveBeenCalledWith(DefaultSizeStyle, 's');
    });

    it('on a phone, the pen button offers colour and size, and applies them to new and selected strokes', async () => {
        setViewport(true);
        const user = userEvent.setup();
        render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
        await user.click(await screen.findByRole('button', { name: 'Pen colour and size' }));
        expect(await screen.findByRole('dialog', { name: 'Pen colour and size' })).toBeInTheDocument();
        const editor = tl.editors.at(-1);

        await user.click(screen.getByRole('button', { name: 'Colour: blue' }));
        expect(editor.setStyleForNextShapes).toHaveBeenCalledWith(DefaultColorStyle, 'blue');
        expect(editor.setStyleForSelectedShapes).toHaveBeenCalledWith(DefaultColorStyle, 'blue');

        await user.click(screen.getByRole('button', { name: 'Size: Large' }));
        expect(editor.setStyleForNextShapes).toHaveBeenCalledWith(DefaultSizeStyle, 'l');
        expect(editor.setStyleForSelectedShapes).toHaveBeenCalledWith(DefaultSizeStyle, 'l');
        // White is left out: it would be invisible on the page.
        expect(screen.queryByRole('button', { name: 'Colour: white' })).not.toBeInTheDocument();
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

    describe('the S Pen side button is an eraser', () => {
        const fire = (type, { pointerType = 'pen', button = 0, buttons = 0, pointerId = 7 } = {}) => {
            const canvas = screen.getByTestId('tl-canvas');
            const e = new PointerEvent(type, { pointerType, button, buttons, pointerId, bubbles: true, cancelable: true, clientX: 10, clientY: 20 });
            act(() => { canvas.dispatchEvent(e); });
            return e;
        };
        const mount = async () => {
            render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
            await screen.findByTestId('tldraw-mock');
            const editor = tl.editors.at(-1);
            editor.events.length = 0;
            editor.setCurrentTool.mockClear();
            return editor;
        };

        it('button 2 on a pen erases that stroke, then puts the pen back', async () => {
            const editor = await mount();
            expect(editor.getCurrentToolId()).toBe('draw');

            fire('pointerdown', { button: 2, buttons: 2 });
            expect(editor.getCurrentToolId()).toBe('eraser');
            // tldraw saw a primary press while the eraser was the tool, and
            // never a right_click.
            expect(editor.events.map((ev) => ev.name)).toEqual(['pointer_down']);
            expect(editor.events[0]).toMatchObject({ button: 0, isPen: true, toolAtDispatch: 'eraser' });

            fire('pointerup', { button: 2, buttons: 0 });
            expect(editor.events.map((ev) => ev.name)).toEqual(['pointer_down', 'pointer_up']);
            expect(editor.events[1].toolAtDispatch).toBe('eraser');
            expect(editor.getCurrentToolId()).toBe('draw');
        });

        it('button 2 alone, or the barrel bit alone (tip down with the button held), both erase', async () => {
            const editor = await mount();
            fire('pointerdown', { button: 2, buttons: 0 });
            expect(editor.getCurrentToolId()).toBe('eraser');
            fire('pointerup', { button: 2 });
            expect(editor.getCurrentToolId()).toBe('draw');

            fire('pointerdown', { button: 0, buttons: 3 });
            expect(editor.getCurrentToolId()).toBe('eraser');
            fire('pointerup', { button: 0 });
            expect(editor.getCurrentToolId()).toBe('draw');
        });

        it("the barrel press never starts Radix's long-press menu timer; a plain pen stroke still reaches it", async () => {
            await mount();
            fire('pointerdown', { button: 2, buttons: 2 });
            fire('pointerup', { button: 2 });
            expect(tl.longPresses).toHaveLength(0);
            fire('pointerdown', { button: 0, buttons: 1, pointerId: 8 });
            expect(tl.longPresses).toHaveLength(1);
        });

        it('buttons & 32 (the eraser bit) erases and restores, on pointercancel too', async () => {
            const editor = await mount();
            fire('pointerdown', { button: 0, buttons: 32 });
            expect(editor.getCurrentToolId()).toBe('eraser');
            fire('pointercancel', { button: -1, buttons: 0 });
            expect(editor.getCurrentToolId()).toBe('draw');
            expect(editor.events.map((ev) => ev.name)).toEqual(['pointer_down', 'pointer_up']);
        });

        it('restores whatever tool was in use, not always the pen', async () => {
            const editor = await mount();
            act(() => { editor.setCurrentTool('hand'); });
            fire('pointerdown', { button: 2, buttons: 2 });
            fire('pointerup', { button: 2 });
            expect(editor.getCurrentToolId()).toBe('hand');
        });

        it('only the pressing pointer ends it', async () => {
            const editor = await mount();
            fire('pointerdown', { button: 2, buttons: 2, pointerId: 7 });
            fire('pointerup', { pointerType: 'touch', pointerId: 9 });
            expect(editor.getCurrentToolId()).toBe('eraser');
            fire('pointerup', { button: 2, pointerId: 7 });
            expect(editor.getCurrentToolId()).toBe('draw');
        });

        it('a plain pen stroke is untouched', async () => {
            const editor = await mount();
            fire('pointerdown', { button: 0, buttons: 1 });
            expect(editor.setCurrentTool).not.toHaveBeenCalled();
            expect(editor.events.map((ev) => ev.name)).toEqual(['pointer_down']);
            expect(editor.events[0].toolAtDispatch).toBe('draw');
        });

        it('a mouse right-click is untouched, and still opens the context menu', async () => {
            const editor = await mount();
            fire('pointerdown', { pointerType: 'mouse', button: 2, buttons: 2 });
            expect(editor.setCurrentTool).not.toHaveBeenCalled();
            expect(editor.events.map((ev) => ev.name)).toEqual(['right_click']);
            fire('pointerup', { pointerType: 'mouse', button: 2 });
            const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
            act(() => { screen.getByTestId('tl-canvas').dispatchEvent(menu); });
            expect(tl.contextMenus).toHaveLength(1);
        });

        it('a pen never opens the context menu', async () => {
            await mount();
            fire('pointerdown', { button: 2, buttons: 2 });
            const menu = new PointerEvent('contextmenu', { pointerType: 'pen', bubbles: true, cancelable: true });
            act(() => { screen.getByTestId('tl-canvas').dispatchEvent(menu); });
            fire('pointerup', { button: 2 });
            // Some browsers send contextmenu as a plain MouseEvent after the press.
            const plain = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
            act(() => { screen.getByTestId('tl-canvas').dispatchEvent(plain); });
            expect(tl.contextMenus).toHaveLength(0);
            expect(menu.defaultPrevented).toBe(true);
            expect(plain.defaultPrevented).toBe(true);
        });

        it('is off in a read-only sketch', async () => {
            render(<HandwrittenEditor content="" setContent={setContent} readOnly />, { wrapper: AllProviders });
            await screen.findByTestId('tldraw-mock');
            const editor = tl.editors.at(-1);
            editor.setCurrentTool.mockClear();
            fire('pointerdown', { button: 2, buttons: 2 });
            expect(editor.setCurrentTool).not.toHaveBeenCalledWith('eraser');
        });
    });

    describe('exporting the page for "Convert handwriting to text"', () => {
        const mountWithApi = async () => {
            const api = { current: null };
            render(<HandwrittenEditor content="" setContent={setContent} sketchApiRef={api} />, { wrapper: AllProviders });
            await screen.findByTestId('tldraw-mock');
            return { api, editor: tl.editors.at(-1) };
        };

        it('hands the page an export API once tldraw mounts, and takes it back on unmount', async () => {
            const api = { current: null };
            const { unmount } = render(<HandwrittenEditor content="" setContent={setContent} sketchApiRef={api} />, { wrapper: AllProviders });
            await screen.findByTestId('tldraw-mock');
            expect(typeof api.current.exportPng).toBe('function');
            expect(api.current.hasShapes()).toBe(false);
            unmount();
            expect(api.current).toBeNull();
        });

        it("uses tldraw's exportToBlob on every shape of the page, then flattens onto white within 2000px", async () => {
            const { api, editor } = await mountWithApi();
            editor.shapeIds = new Set(['shape:a', 'shape:b']);

            // jsdom has no canvas or createImageBitmap. Stand in for the
            // browser's, recording what is drawn.
            const ops = [];
            const ctx = {
                set fillStyle(v) { ops.push(['fillStyle', v]); },
                fillRect: (...a) => ops.push(['fillRect', ...a]),
                drawImage: (_img, ...a) => ops.push(['drawImage', ...a]),
            };
            const realGetContext = HTMLCanvasElement.prototype.getContext;
            const realToBlob = HTMLCanvasElement.prototype.toBlob;
            HTMLCanvasElement.prototype.getContext = function getContext() { return ctx; };
            HTMLCanvasElement.prototype.toBlob = function toBlob(cb, type) {
                ops.push(['toBlob', type, this.width, this.height]);
                cb(new Blob(['flat-png'], { type }));
            };
            // tldraw's own 2x render of a very wide page: 4000 x 1000.
            global.createImageBitmap = vi.fn(async () => ({ width: 4000, height: 1000, close: vi.fn() }));
            try {
                const out = await api.current.exportPng();

                expect(tl.exportToBlob).toHaveBeenCalledTimes(1);
                const [{ editor: passed, ids, format, opts }] = tl.exportToBlob.mock.calls[0];
                expect(passed).toBe(editor);
                expect(ids).toEqual(['shape:a', 'shape:b']);
                expect(format).toBe('png');
                expect(opts).toMatchObject({ darkMode: false, background: false });
                // 900 wide + padding, rendered at tldraw's 2x, must fit 2000px.
                expect(opts.scale * (900 + 64) * 2).toBeLessThanOrEqual(2000);

                // White, painted over the whole canvas BEFORE the ink.
                expect(ops[0]).toEqual(['fillStyle', '#ffffff']);
                expect(ops[1]).toEqual(['fillRect', 0, 0, 2000, 500]);
                expect(ops[2]).toEqual(['drawImage', 0, 0, 2000, 500]);
                expect(ops.at(-1)).toEqual(['toBlob', 'image/png', 2000, 500]);
                expect(out).toMatchObject({ mediaType: 'image/png', width: 2000, height: 500 });
                expect(atob(out.base64)).toBe('flat-png');
            } finally {
                HTMLCanvasElement.prototype.getContext = realGetContext;
                HTMLCanvasElement.prototype.toBlob = realToBlob;
                delete global.createImageBitmap;
            }
        });

        it('an empty page is refused before tldraw is asked', async () => {
            const { api } = await mountWithApi();
            await expect(api.current.exportPng()).rejects.toMatchObject({ code: 'empty' });
            expect(tl.exportToBlob).not.toHaveBeenCalled();
        });
    });

    describe('a photo sketch note opens on its first page (HANDWRITING.md §3)', () => {
        const shape = (id, type, index, y, extra = {}) => ({ id, typeName: 'shape', type, index, x: 0, y, props: { w: 1000, h: 1333 }, ...extra });
        const snap = (...shapes) => JSON.stringify({ store: Object.fromEntries(shapes.map((r) => [r.id, r])), schema: {} });

        // jsdom does no layout; the fit waits for a measured container.
        let rect;
        beforeEach(() => {
            rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
                left: 0, top: 0, right: 390, bottom: 700, width: 390, height: 700, x: 0, y: 0, toJSON: () => ({}),
            });
        });
        afterEach(() => rect.mockRestore());

        it('zooms to the first image shape by index, no further in than 100%, camera only', async () => {
            render(
                <HandwrittenEditor
                    content={snap(shape('shape:b', 'image', 'a2', 1381), shape('shape:a', 'image', 'a1', 0), shape('shape:c', 'draw', 'a3', 10, { props: {} }))}
                    setContent={setContent}
                />,
                { wrapper: AllProviders }
            );
            const editor = tl.editors.at(-1);
            await waitFor(() => expect(editor.zoomToBounds).toHaveBeenCalledTimes(1));
            expect(editor.zoomToBounds).toHaveBeenCalledWith({ x: 0, y: 0, w: 1000, h: 1333 }, { targetZoom: 1, inset: 32 });
            // Only once the viewport has its real size: before that tldraw
            // assumes 1080×720, and a fit then lands at 100%, off to one side.
            expect(editor.updateViewportScreenBounds).toHaveBeenCalled();
            expect(editor.updateViewportScreenBounds.mock.invocationCallOrder[0])
                .toBeLessThan(editor.zoomToBounds.mock.invocationCallOrder[0]);
            // Once: later resizes leave the writer's camera alone.
            await new Promise((r) => setTimeout(r, 260));
            expect(editor.zoomToBounds).toHaveBeenCalledTimes(1);
            // Nothing was written: the camera is not the document.
            expect(setContent).not.toHaveBeenCalled();
        });

        it('leaves an ordinary sketch (no images) where it always opened', async () => {
            render(<HandwrittenEditor content={snap(shape('shape:a', 'draw', 'a1', 0, { props: {} }))} setContent={setContent} />, { wrapper: AllProviders });
            const editor = tl.editors.at(-1);
            await waitFor(() => expect(editor.store.loadSnapshot).toHaveBeenCalled());
            await waitFor(() => expect(editor.updateViewportScreenBounds).toHaveBeenCalledTimes(2));
            expect(editor.zoomToBounds).not.toHaveBeenCalled();
        });
    });

    describe('the Fine pen', () => {
        // A stroke as tldraw's Drawing state creates it: one point, scale 1.
        const newStroke = (props = {}) => ({
            id: 'shape:new', typeName: 'shape', type: 'draw',
            props: { size: 's', scale: 1, segments: [{ type: 'free', points: [{ x: 0, y: 0, z: 0.5 }] }], ...props },
        });
        const liveHandler = (editor) => {
            const live = editor.beforeCreate.filter((_, i) => editor.beforeCreateOffs[i].mock.calls.length === 0);
            expect(live).toHaveLength(1);
            expect(live[0].typeName).toBe('shape');
            return live[0].handler;
        };
        const drawing = (editor) => { editor.setCurrentTool('draw'); editor.toolState = 'drawing'; };

        it('is the default: a new stroke gets scale 0.5', async () => {
            render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
            await screen.findByTestId('tldraw-mock');
            const editor = tl.editors.at(-1);
            expect(editor.setStyleForNextShapes).toHaveBeenCalledWith(DefaultSizeStyle, 's');
            drawing(editor);
            expect(liveHandler(editor)(newStroke(), 'user').props.scale).toBe(0.5);
        });

        it('sets the scale rather than multiplying it, so a long stroke is not halved again when tldraw splits it', async () => {
            render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
            await screen.findByTestId('tldraw-mock');
            const editor = tl.editors.at(-1);
            drawing(editor);
            // tldraw's continuation shape copies the previous (Fine) scale.
            expect(liveHandler(editor)(newStroke({ scale: 0.5 }), 'user').props.scale).toBe(0.5);
            // In dynamic-size mode tldraw starts a stroke at 1/zoom.
            editor.user.getIsDynamicResizeMode.mockReturnValue(true);
            editor.getZoomLevel.mockReturnValue(2);
            expect(liveHandler(editor)(newStroke({ scale: 0.5 }), 'user').props.scale).toBe(0.25);
        });

        it('leaves every stroke already on the page alone (a sketch loading runs this handler too)', async () => {
            render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
            await screen.findByTestId('tldraw-mock');
            const editor = tl.editors.at(-1);
            const handler = liveHandler(editor);
            const saved = newStroke({ segments: [{ type: 'free', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 9, y: 2 }] }] });
            // The draw tool is active but idle: this is a load, a paste, an undo.
            editor.setCurrentTool('draw');
            expect(handler(newStroke(), 'user').props.scale).toBe(1);
            // Mid-drawing, a many-point record is still not a new stroke.
            editor.toolState = 'drawing';
            expect(handler(saved, 'user')).toBe(saved);
        });

        it('touches only draw strokes at size s, from the user', async () => {
            render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
            await screen.findByTestId('tldraw-mock');
            const editor = tl.editors.at(-1);
            const handler = liveHandler(editor);
            drawing(editor);
            const geo = { id: 'shape:g', typeName: 'shape', type: 'geo', props: { size: 's', scale: 1 } };
            const highlight = { ...newStroke(), type: 'highlight' };
            const medium = newStroke({ size: 'm' });
            const remote = newStroke();
            expect(handler(geo, 'user')).toBe(geo);
            expect(handler(highlight, 'user')).toBe(highlight);
            expect(handler(medium, 'user')).toBe(medium);
            expect(handler(remote, 'remote')).toBe(remote);
        });

        it('on a phone: Fine is listed first and pressed; Small brings scale 1 back, Fine returns it', async () => {
            setViewport(true);
            const user = userEvent.setup();
            render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
            await user.click(await screen.findByRole('button', { name: 'Pen colour and size' }));
            const sizes = within(screen.getByRole('group', { name: 'Pen size' })).getAllByRole('button');
            expect(sizes.map((b) => b.getAttribute('aria-label'))).toEqual(['Size: Fine', 'Size: Small', 'Size: Medium', 'Size: Large', 'Size: Extra large']);
            expect(sizes[0]).toHaveAttribute('aria-pressed', 'true');
            expect(sizes[1]).toHaveAttribute('aria-pressed', 'false');

            const editor = tl.editors.at(-1);
            const handler = liveHandler(editor);
            await user.click(sizes[1]);
            expect(editor.setStyleForNextShapes).toHaveBeenLastCalledWith(DefaultSizeStyle, 's');
            expect(screen.getByRole('button', { name: 'Size: Small' })).toHaveAttribute('aria-pressed', 'true');
            drawing(editor);
            expect(handler(newStroke(), 'user').props.scale).toBe(1);

            await user.click(screen.getByRole('button', { name: 'Size: Fine' }));
            expect(editor.setStyleForNextShapes).toHaveBeenLastCalledWith(DefaultSizeStyle, 's');
            expect(handler(newStroke(), 'user').props.scale).toBe(0.5);
        });

        it("the pen button's dot is smallest on Fine", async () => {
            setViewport(true);
            const user = userEvent.setup();
            render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
            const pen = await screen.findByRole('button', { name: 'Pen colour and size' });
            const dotWidth = () => parseFloat(getComputedStyle(pen.querySelector('[aria-hidden]')).width);
            const fine = dotWidth();
            await user.click(pen);
            await user.click(screen.getByRole('button', { name: 'Size: Small' }));
            expect(fine).toBeGreaterThan(0);
            expect(dotWidth()).toBeGreaterThan(fine);
        });

        it('does not stack handlers when tldraw rebuilds its editor', async () => {
            const { rerender } = render(<HandwrittenEditor content="" setContent={setContent} />, { wrapper: AllProviders });
            await screen.findByTestId('tldraw-mock');
            setViewport(true);
            await act(async () => { window.dispatchEvent(new Event('resize')); });
            rerender(<HandwrittenEditor content="" setContent={setContent} />);
            await screen.findByRole('button', { name: 'Write' });
            expect(tl.editors.length).toBeGreaterThanOrEqual(2);
            expect(tl.editors[0].beforeCreateOffs[0]).toHaveBeenCalledTimes(1);
            const live = tl.editors.flatMap((e) => e.beforeCreateOffs).filter((off) => off.mock.calls.length === 0);
            expect(live).toHaveLength(1);
        });

        it('is not registered on a read-only sketch', async () => {
            render(<HandwrittenEditor content="" setContent={setContent} readOnly />, { wrapper: AllProviders });
            await screen.findByTestId('tldraw-mock');
            expect(tl.editors.at(-1).sideEffects.registerBeforeCreateHandler).not.toHaveBeenCalled();
        });
    });
});
