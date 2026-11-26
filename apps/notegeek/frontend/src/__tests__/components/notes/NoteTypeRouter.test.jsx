import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import NoteTypeRouter, { NOTE_TYPES } from '../../../components/notes/NoteTypeRouter';

// Mock the user preferences hook
vi.mock('@geeksuite/user', () => ({
    useAppPreferences: vi.fn(() => ({ preferences: { editorFontSize: 14 } })),
}));

// We can mock the editor components heavily to avoid rendering actual complex editors while testing the router.
vi.mock('../../../components/editors/MarkdownEditor', () => ({
    default: () => <div data-testid="markdown-editor-mock">Markdown Editor</div>
}));
vi.mock('../../../components/editors/HandwrittenEditor', () => ({
    default: () => <div data-testid="handwritten-editor-mock">Handwritten Editor</div>
}));

describe('NoteTypeRouter', () => {
    it('renders MarkdownEditor by default for a type that is no longer offered', async () => {
        for (const type of ['unknown', 'text', 'code', 'mindmap']) {
            const { unmount } = render(<NoteTypeRouter type={type} content="hi" onChange={vi.fn()} />);
            await waitFor(() => {
                expect(screen.getByTestId('markdown-editor-mock')).toBeInTheDocument();
            });
            unmount();
        }
    });

    it('renders MarkdownEditor for markdown type', async () => {
        render(<NoteTypeRouter type={NOTE_TYPES.MARKDOWN} content="hi" onChange={vi.fn()} />);
        await waitFor(() => {
            expect(screen.getByTestId('markdown-editor-mock')).toBeInTheDocument();
        });
    });

    it('renders HandwrittenEditor for handwritten type', async () => {
        render(<NoteTypeRouter type={NOTE_TYPES.HANDWRITTEN} content="hi" onChange={vi.fn()} />);
        await waitFor(() => {
            expect(screen.getByTestId('handwritten-editor-mock')).toBeInTheDocument();
        });
    });
});
