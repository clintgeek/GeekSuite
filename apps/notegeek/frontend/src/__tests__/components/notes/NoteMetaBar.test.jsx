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
        expect(screen.getByText('Markdown')).toBeInTheDocument();

        rerender(
            <AllProviders>
                <NoteMetaBar title="" noteType="code" tags={[]} />
            </AllProviders>
        );
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
