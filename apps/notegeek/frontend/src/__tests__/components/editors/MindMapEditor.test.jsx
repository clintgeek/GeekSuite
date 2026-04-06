import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

// Mock ReactFlow partially to avoid SVG/DOM rendering complexity in jsdom
vi.mock('reactflow', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        default: ({ children }) => <div data-testid="react-flow-mock">{children}</div>,
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

    it('initializes default graph and updates content', async () => {
        render(<MindMapEditor content="" setContent={mockSetContent} />, { wrapper: AllProviders });

        // Due to the delay and reactflow internals, we wait for setContent to be called with the initial node
        await waitFor(() => {
            expect(mockSetContent).toHaveBeenCalled();
        });

        const lastCall = mockSetContent.mock.calls[mockSetContent.mock.calls.length - 1][0];
        const parsed = JSON.parse(lastCall);
        expect(parsed.nodes[0].data.label).toBe('Main Idea');
    });

    it('loads parsed content properly', async () => {
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

        await waitFor(() => {
            // Once mockSetContent is called, it means the nodes updated and it serialized them back
            expect(mockSetContent).toHaveBeenCalled();
        });

        const lastCall = mockSetContent.mock.calls[mockSetContent.mock.calls.length - 1][0];
        const parsed = JSON.parse(lastCall);
        expect(parsed.nodes).toHaveLength(2);
        expect(parsed.nodes[1].data.label).toBe('Child Idea');
    });
});
