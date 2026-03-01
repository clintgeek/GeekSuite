import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

// Mock tldraw completely to avoid canvas/jsdom complex rendering issues
vi.mock('@tldraw/tldraw', () => ({
    Tldraw: ({ onMount }) => {
        // Simulate immediate mount
        import('react').then(({ useEffect }) => {
            // we use a simple timeout to simulate mount in a functional component mock isn't straightforward without custom hook
        });
        return <div data-testid="tldraw-mock">tldraw-canvas</div>;
    },
    useEditor: vi.fn(() => ({
        getCurrentToolId: vi.fn(() => 'draw'),
        getCanUndo: vi.fn(() => true),
        setCurrentTool: vi.fn(),
        undo: vi.fn(),
        updateViewportScreenBounds: vi.fn(),
        store: {
            listen: vi.fn(),
            getSnapshot: vi.fn(() => ({ snapshot: true })),
            loadSnapshot: vi.fn(),
        }
    })),
    useValue: vi.fn((name, fn) => fn()),
}));

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};

describe('HandwrittenEditor', () => {
    let mockSetContent;

    beforeEach(() => {
        mockSetContent = vi.fn();
        vi.clearAllMocks();
    });

    it('renders the editor without crashing', () => {
        render(<HandwrittenEditor content="" setContent={mockSetContent} />, { wrapper: AllProviders });
        expect(screen.getByTestId('tldraw-mock')).toBeInTheDocument();
    });
});
