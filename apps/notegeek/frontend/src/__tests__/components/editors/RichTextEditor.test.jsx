import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import ThemeModeProvider from '../../../theme/ThemeModeProvider';
import RichTextEditor from '../../../components/editors/RichTextEditor';

const AllProviders = ({ children }) => (
    <ThemeModeProvider>
        <MantineProvider>
            <MemoryRouter>{children}</MemoryRouter>
        </MantineProvider>
    </ThemeModeProvider>
);

// Mock window.prompt for adding links
window.prompt = vi.fn();

// Mock window.matchMedia
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

// Polyfill text selection ranges for Tiptap
document.createRange = () => {
    const range = new Range();
    range.getBoundingClientRect = vi.fn();
    range.getClientRects = () => {
        return {
            item: () => null,
            length: 0,
            [Symbol.iterator]: vi.fn()
        };
    };
    return range;
};

describe('RichTextEditor', () => {
    let mockSetContent;

    beforeEach(() => {
        mockSetContent = vi.fn();
        vi.clearAllMocks();
    });

    it('renders editor content', async () => {
        render(<RichTextEditor content="<p>Initial content</p>" setContent={mockSetContent} />, { wrapper: AllProviders });
        // Tiptap might take a moment to render
        await waitFor(() => {
            expect(screen.getByText('Initial content')).toBeInTheDocument();
        });
    });

    it('renders formatting buttons', async () => {
        render(<RichTextEditor content="" setContent={mockSetContent} />, { wrapper: AllProviders });
        await waitFor(() => {
            expect(screen.getByLabelText('Bold')).toBeInTheDocument();
            expect(screen.getByLabelText('Italic')).toBeInTheDocument();
            expect(screen.getByLabelText('Underline')).toBeInTheDocument();
        });
    });

    it('disables editing when isLoading', async () => {
        const { container } = render(<RichTextEditor content="Text" isLoading={true} setContent={mockSetContent} />, { wrapper: AllProviders });

        await waitFor(() => {
            expect(screen.getByText('Text')).toBeInTheDocument();
        });

        // Tiptap sets contenteditable="false" when disabled
        const editorContent = container.querySelector('.ProseMirror');
        expect(editorContent).toHaveAttribute('contenteditable', 'false');
    });
});
