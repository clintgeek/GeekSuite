import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import NoteTypeRouter, { NOTE_TYPES } from '../../../components/notes/NoteTypeRouter';

// Mock the user preferences hook
vi.mock('@geeksuite/user', () => ({
    useAppPreferences: vi.fn(() => ({ preferences: { editorFontSize: 14 } })),
}));

// We can mock the editor components heavily to avoid rendering actual complex editors while testing the router.
vi.mock('../../../components/editors/RichTextEditor', () => ({
    default: () => <div data-testid="richtext-editor-mock">Rich Text Editor</div>
}));
vi.mock('../../../components/editors/MarkdownEditor', () => ({
    default: () => <div data-testid="markdown-editor-mock">Markdown Editor</div>
}));
vi.mock('../../../components/editors/CodeEditor', () => ({
    default: () => <div data-testid="code-editor-mock">Code Editor</div>
}));
vi.mock('../../../components/editors/MindMapEditor', () => ({
    default: () => <div data-testid="mindmap-editor-mock">MindMap Editor</div>
}));
vi.mock('../../../components/editors/HandwrittenEditor', () => ({
    default: () => <div data-testid="handwritten-editor-mock">Handwritten Editor</div>
}));

describe('NoteTypeRouter', () => {
    it('renders RichTextEditor by default for unknown type', async () => {
        render(<NoteTypeRouter type="unknown" content="hi" onChange={vi.fn()} />);
        await waitFor(() => {
            expect(screen.getByTestId('richtext-editor-mock')).toBeInTheDocument();
        });
    });

    it('renders RichTextEditor for text type', async () => {
        render(<NoteTypeRouter type={NOTE_TYPES.TEXT} content="hi" onChange={vi.fn()} />);
        await waitFor(() => {
            expect(screen.getByTestId('richtext-editor-mock')).toBeInTheDocument();
        });
    });

    it('renders MarkdownEditor for markdown type', async () => {
        render(<NoteTypeRouter type={NOTE_TYPES.MARKDOWN} content="hi" onChange={vi.fn()} />);
        await waitFor(() => {
            expect(screen.getByTestId('markdown-editor-mock')).toBeInTheDocument();
        });
    });

    it('renders CodeEditor for code type', async () => {
        render(<NoteTypeRouter type={NOTE_TYPES.CODE} content="hi" onChange={vi.fn()} />);
        await waitFor(() => {
            expect(screen.getByTestId('code-editor-mock')).toBeInTheDocument();
        });
    });

    it('renders MindMapEditor for mindmap type', async () => {
        render(<NoteTypeRouter type={NOTE_TYPES.MINDMAP} content="hi" onChange={vi.fn()} />);
        await waitFor(() => {
            expect(screen.getByTestId('mindmap-editor-mock')).toBeInTheDocument();
        });
    });

    it('renders HandwrittenEditor for handwritten type', async () => {
        render(<NoteTypeRouter type={NOTE_TYPES.HANDWRITTEN} content="hi" onChange={vi.fn()} />);
        await waitFor(() => {
            expect(screen.getByTestId('handwritten-editor-mock')).toBeInTheDocument();
        });
    });
});
