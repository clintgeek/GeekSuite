import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import ThemeModeProvider from '../../../theme/ThemeModeProvider';
import MindMapEditor from '../../../components/editors/MindMapEditor';

const AllProviders = ({ children }) => (
    <ThemeModeProvider>
        <MantineProvider>
            <MemoryRouter>{children}</MemoryRouter>
        </MantineProvider>
    </ThemeModeProvider>
);

// Mock window.matchMedia and ResizeObserver
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

global.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};

// Mock ReactFlow partially to avoid SVG/DOM rendering complexity in jsdom.
//
// The mock renders the NODES it is handed through `nodeTypes`, which the
// earlier version did not. Without that the editor's own controls (add child,
// delete, rename) were unreachable from a test, so "does a real edit still get
// reported?" could not be asserted at all — and that is exactly the question
// the baseline guard added in the 2026-09-05 going-over has to answer.
vi.mock('reactflow', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        default: ({ children, nodes = [], nodeTypes = {} }) => (
            <div data-testid="react-flow-mock">
                {nodes.map((node) => {
                    const NodeComponent = nodeTypes[node.type];
                    return NodeComponent
                        ? <NodeComponent key={node.id} id={node.id} data={node.data} />
                        : null;
                })}
                {children}
            </div>
        ),
        MiniMap: () => <div data-testid="minimap-mock" />,
        Controls: () => <div data-testid="controls-mock" />,
        Background: () => <div data-testid="background-mock" />,
    };
});

describe('MindMapEditor', () => {
    let mockSetContent;

    beforeEach(() => {
        mockSetContent = vi.fn();
        vi.clearAllMocks();
    });

    it('renders the editor without crashing', () => {
        render(<MindMapEditor content="" setContent={mockSetContent} />, { wrapper: AllProviders });
        expect(screen.getByTestId('react-flow-mock')).toBeInTheDocument();
    });

    /**
     * Rewritten in the 2026-09-05 going-over. These two cases used to assert
     * that merely RENDERING the editor calls `setContent` — which is precisely
     * the defect, not the contract:
     *
     *   - a brand-new map emits the default "Main Idea" node, so the page above
     *     marks the note dirty and autosaves it two seconds later. Visiting
     *     `/notes/new?type=mindmap` and walking away left an Untitled Note
     *     nobody asked for.
     *   - an EXISTING map re-serializes with the width/height/positionAbsolute
     *     that ReactFlow stamps onto measured nodes, which differs from what is
     *     stored — so opening a map (in view mode, no less) saved it.
     *
     * The first serialization after initializing is now adopted as a baseline
     * rather than reported as an edit. What must still be reported is a real
     * change, which the third case covers.
     */
    it('does not report a change just for opening a new map', async () => {
        render(<MindMapEditor content="" setContent={mockSetContent} />, { wrapper: AllProviders });

        // The serializer runs on a 100ms debounce; give it well past that.
        await new Promise((r) => setTimeout(r, 400));
        expect(mockSetContent).not.toHaveBeenCalled();
        // …and it did render the default map, which is what the writer sees.
        expect(screen.getByTestId('react-flow-mock')).toBeInTheDocument();
    });

    it('does not report a change just for opening a saved map', async () => {
        const initialContent = JSON.stringify({
            nodes: [
                { id: '0', type: 'mindmap', data: { label: 'Root Idea', isRoot: true }, position: { x: 0, y: 0 } },
                { id: '1', type: 'mindmap', data: { label: 'Child Idea', isRoot: false }, position: { x: 100, y: 100 } }
            ],
            edges: [
                { id: 'e0-1', source: '0', target: '1' }
            ]
        });

        render(<MindMapEditor content={initialContent} setContent={mockSetContent} />, { wrapper: AllProviders });

        await new Promise((r) => setTimeout(r, 400));
        expect(mockSetContent).not.toHaveBeenCalled();
    });

    it('never reports a change while readOnly, however the graph settles', async () => {
        const initialContent = JSON.stringify({
            nodes: [{ id: '0', type: 'mindmap', data: { label: 'Root Idea', isRoot: true }, position: { x: 0, y: 0 } }],
            edges: []
        });

        render(<MindMapEditor content={initialContent} setContent={mockSetContent} readOnly />, { wrapper: AllProviders });

        await new Promise((r) => setTimeout(r, 400));
        expect(mockSetContent).not.toHaveBeenCalled();
    });

    /**
     * The other side of the guard, and the one that matters most: suppressing
     * the baseline must not suppress the writer. A guard that swallowed every
     * emission would make mind maps silently unsaveable, and the three cases
     * above would all still pass.
     */
    it('still reports a real edit after the baseline is adopted', async () => {
        const initialContent = JSON.stringify({
            nodes: [{ id: '0', type: 'mindmap', data: { label: 'Root Idea', isRoot: true }, position: { x: 0, y: 0 } }],
            edges: []
        });

        render(<MindMapEditor content={initialContent} setContent={mockSetContent} />, { wrapper: AllProviders });

        await new Promise((r) => setTimeout(r, 400));
        expect(mockSetContent).not.toHaveBeenCalled();

        // Add a child node — a genuine edit, through the node's own control.
        fireEvent.click(screen.getByRole('button', { name: 'Add child (Tab)' }));

        await waitFor(() => expect(mockSetContent).toHaveBeenCalled());
        const parsed = JSON.parse(mockSetContent.mock.calls.at(-1)[0]);
        expect(parsed.nodes).toHaveLength(2);
    });

    it('reports nothing for that same edit when readOnly', async () => {
        const initialContent = JSON.stringify({
            nodes: [{ id: '0', type: 'mindmap', data: { label: 'Root Idea', isRoot: true }, position: { x: 0, y: 0 } }],
            edges: []
        });

        render(<MindMapEditor content={initialContent} setContent={mockSetContent} readOnly />, { wrapper: AllProviders });
        await new Promise((r) => setTimeout(r, 400));

        // In readOnly the control is not rendered at all — the callbacks are
        // stripped from node data — so there is nothing to click.
        expect(screen.queryByRole('button', { name: 'Add child (Tab)' })).not.toBeInTheDocument();
        expect(mockSetContent).not.toHaveBeenCalled();
    });
});
