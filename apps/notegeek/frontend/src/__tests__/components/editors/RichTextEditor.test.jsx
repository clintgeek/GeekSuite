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

    /**
     * Regression, 2026-09-05 going-over.
     *
     * This editor used to report changes ONLY in `onBlur`, which made it the
     * odd one out (MarkdownEditor and CodeEditor both call `setContent` per
     * keystroke) and had two consequences on the page above it: the 2s autosave
     * never armed while the caret was in the body, because nothing had set
     * `dirty`; and Cmd/Ctrl+S — which does not blur — persisted the PRE-EDIT
     * html. Writing a rich-text note and hitting save was a no-op.
     */
    it('reports a change as it is typed, not only on blur', async () => {
        const { container } = render(
            <RichTextEditor content="<p>Initial content</p>" setContent={mockSetContent} />,
            { wrapper: AllProviders }
        );
        await waitFor(() => expect(screen.getByText('Initial content')).toBeInTheDocument());

        const surface = container.querySelector('.ProseMirror');
        // Typing through ProseMirror's own input path fires `onUpdate`.
        fireEvent.input(surface, {
            target: { innerHTML: '<p>Initial content, edited</p>' },
        });

        await waitFor(() => expect(mockSetContent).toHaveBeenCalled());
        expect(mockSetContent.mock.calls.at(-1)[0]).toContain('edited');
        // And no blur was needed to get there.
        expect(document.activeElement).not.toBe(null);
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
