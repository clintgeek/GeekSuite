import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import ThemeModeProvider from '../../../theme/ThemeModeProvider';
import NoteMetaBar from '../../../components/notes/NoteMetaBar';

const AllProviders = ({ children }) => (
    <ThemeModeProvider>
        <MantineProvider>
            <MemoryRouter>{children}</MemoryRouter>
        </MantineProvider>
    </ThemeModeProvider>
);

vi.mock('../../../components/TagSelector', () => ({
    default: ({ selectedTags, disabled }) => (
        <div data-testid="tag-selector-mock">
            {disabled ? 'disabled' : 'active'} - Tags: {selectedTags?.join(', ')}
        </div>
    )
}));

describe('NoteMetaBar', () => {
    let mockOnTitleChange, mockOnTagsChange;

    beforeEach(() => {
        mockOnTitleChange = vi.fn();
        mockOnTagsChange = vi.fn();
        vi.clearAllMocks();
    });

    it('renders title input and handles changes', () => {
        render(
            <NoteMetaBar
                title="My Title"
                onTitleChange={mockOnTitleChange}
                noteType="markdown"
                tags={[]}
                onTagsChange={mockOnTagsChange}
            />,
            { wrapper: AllProviders }
        );

        const titleInput = screen.getByLabelText('Note title');
        expect(titleInput).toHaveValue('My Title');

        fireEvent.change(titleInput, { target: { value: 'New Title' } });
        expect(mockOnTitleChange).toHaveBeenCalledWith('New Title');
    });

    it('displays the correct note type badge', () => {
        const { rerender } = render(
            <NoteMetaBar title="" noteType="markdown" tags={[]} />,
            { wrapper: AllProviders }
        );
        // Markdown is the default note, so the meta line just says "Note".
        expect(screen.getByText('Note')).toBeInTheDocument();

        // rerender reuses the original `wrapper`; re-wrapping would nest routers.
        rerender(<NoteMetaBar title="" noteType="code" tags={[]} />);
        expect(screen.getByText('Code')).toBeInTheDocument();
    });

    it('passes down props to TagSelector', () => {
        render(
            <NoteMetaBar title="" noteType="text" tags={['work', 'important']} />,
            { wrapper: AllProviders }
        );
        expect(screen.getByTestId('tag-selector-mock')).toHaveTextContent('active - Tags: work, important');
    });

    it('disables inputs when readOnly is true', () => {
        render(
            <NoteMetaBar title="Read Only" noteType="text" tags={[]} readOnly={true} />,
            { wrapper: AllProviders }
        );

        const titleInput = screen.getByLabelText('Note title');
        expect(titleInput).toBeDisabled();
        expect(screen.getByTestId('tag-selector-mock')).toHaveTextContent('disabled');
    });

    it('keeps the quiet status in the meta line and the alert in the header row', () => {
        render(
            <NoteMetaBar
                title=""
                noteType="markdown"
                tags={[]}
                status={<span data-testid="status">saved · just now</span>}
                alert={<span data-testid="alert">not saved</span>}
                actions={<button>more</button>}
            />,
            { wrapper: AllProviders }
        );
        const meta = document.querySelector('[data-note-meta]');
        expect(meta).toContainElement(screen.getByTestId('status'));
        expect(meta).not.toContainElement(screen.getByTestId('alert'));
        // The alert sits in row 1 beside the menu, before the title.
        const title = screen.getByLabelText('Note title');
        expect(screen.getByTestId('alert').compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('renders the leading, status and actions slots', () => {
        render(
            <NoteMetaBar
                title=""
                noteType="text"
                tags={[]}
                leading={<button data-testid="back-btn">Back</button>}
                status={<span data-testid="stamp">Saved</span>}
            />,
            { wrapper: AllProviders }
        );
        expect(screen.getByTestId('back-btn')).toBeInTheDocument();
        expect(screen.getByTestId('stamp')).toHaveTextContent('Saved');
    });

    it('renders actions if provided', () => {
        render(
            <NoteMetaBar
                title=""
                noteType="text"
                tags={[]}
                actions={<button data-testid="action-btn">Save</button>}
            />,
            { wrapper: AllProviders }
        );

        expect(screen.getByTestId('action-btn')).toBeInTheDocument();
        expect(screen.getByTestId('action-btn')).toHaveTextContent('Save');
    });
});

// Review 2026-11-20: on a phone the meta line shares row 1 with Back, a
// failed save's pill + Retry, and ⋯. The type's name must give way (end in
// "…") rather than run under the pill. jsdom does not lay out, so this pins
// the rule that makes it give way; the harness and a device check the look.
describe('NoteMetaBar — the type name gives way in a crowded row', () => {
    it('the type label can shrink and ends in an ellipsis', () => {
        render(
            <NoteMetaBar
                title="Roof quote"
                onTitleChange={() => {}}
                noteType="markdown"
                tags={[]}
                onTagsChange={() => {}}
                alert={<span>offline · not saved</span>}
            />,
            { wrapper: AllProviders }
        );
        const wrap = document.querySelector('[data-note-type-label]');
        const label = wrap.lastElementChild;
        expect(getComputedStyle(wrap).minWidth).toMatch(/^0(px)?$/);
        const style = getComputedStyle(label);
        expect(style.overflow).toBe('hidden');
        expect(style.textOverflow).toBe('ellipsis');
        expect(style.whiteSpace).toBe('nowrap');
        expect(style.minWidth).toMatch(/^0(px)?$/);
    });
});
