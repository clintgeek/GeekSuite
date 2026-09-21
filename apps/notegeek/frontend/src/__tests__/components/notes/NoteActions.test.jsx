import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { lightTheme } from '../../testUtils';
import NoteActions from '../../../components/notes/NoteActions';

const theme = lightTheme;
const ThemeWrapper = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

describe('NoteActions', () => {
    let mockOnSave, mockOnDelete, mockOnToggleEdit;

    beforeEach(() => {
        mockOnSave = vi.fn();
        mockOnDelete = vi.fn();
        mockOnToggleEdit = vi.fn();
        vi.clearAllMocks();
    });

    it('renders Save and Delete buttons by default', () => {
        render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} />, { wrapper: ThemeWrapper });
        expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
        // Delete button in inline mode is an icon button, we can query by icon or tooltip
        expect(screen.getByLabelText('Delete note')).toBeInTheDocument();
    });

    it('calls onSave when Save is clicked', () => {
        render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} />, { wrapper: ThemeWrapper });
        fireEvent.click(screen.getByRole('button', { name: /Save/i }));
        expect(mockOnSave).toHaveBeenCalled();
    });

    it('calls onDelete when Delete is clicked', () => {
        render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} />, { wrapper: ThemeWrapper });
        fireEvent.click(screen.getByLabelText('Delete note'));
        expect(mockOnDelete).toHaveBeenCalled();
    });

    it('renders ToggleEdit button when canToggleEdit is true', () => {
        render(
            <NoteActions
                onSave={mockOnSave}
                onDelete={mockOnDelete}
                canToggleEdit={true}
                onToggleEdit={mockOnToggleEdit}
                isEditMode={true}
            />,
            { wrapper: ThemeWrapper }
        );
        const toggleBtn = screen.getByRole('button', { name: /View/i });
        expect(toggleBtn).toBeInTheDocument();

        fireEvent.click(toggleBtn);
        expect(mockOnToggleEdit).toHaveBeenCalled();
    });

    it('disables Save button and shows loading state when isSaving is true', () => {
        render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} isSaving={true} />, { wrapper: ThemeWrapper });
        // While saving, the label is replaced by a spinner, so the save button
        // is identified by its progressbar child rather than by name.
        const saveBtn = screen.getByRole('progressbar').closest('button');
        expect(saveBtn).toBeDisabled();
    });

    it('shows "Saved!" when saveStatus is "Saved"', () => {
        render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} saveStatus="Saved" />, { wrapper: ThemeWrapper });
        expect(screen.getByRole('button', { name: /^Saved$/i })).toBeInTheDocument();
    });

    /**
     * History and Compose are offered by the PRESENCE of a handler, so a note
     * type that cannot be composed simply doesn't get the button. Both have to
     * exist in both layouts: the bottom bar is the only actions row on mobile,
     * and I shipped one of them twice there once already.
     */
    describe.each(['inline', 'bottom-bar'])('History and Compose — %s', (variant) => {
        it('offers neither without a handler', () => {
            render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} variant={variant} />, { wrapper: ThemeWrapper });
            expect(screen.queryByRole('button', { name: 'Version history' })).not.toBeInTheDocument();
            expect(screen.queryByLabelText('Compose a document from this note')).not.toBeInTheDocument();
        });

        it('offers History exactly once, and it calls back', () => {
            const onHistory = vi.fn();
            render(
                <NoteActions onSave={mockOnSave} onDelete={mockOnDelete} onHistory={onHistory} variant={variant} />,
                { wrapper: ThemeWrapper },
            );
            // By role, not by label: MUI puts the tooltip's title on the
            // wrapper span, so a label query matches the span as well.
            expect(screen.getAllByRole('button', { name: 'Version history' })).toHaveLength(1);
            fireEvent.click(screen.getByRole('button', { name: 'Version history' }));
            expect(onHistory).toHaveBeenCalledTimes(1);
        });

        it('offers Compose exactly once, and it calls back', () => {
            const onCompose = vi.fn();
            render(
                <NoteActions onSave={mockOnSave} onDelete={mockOnDelete} onCompose={onCompose} variant={variant} />,
                { wrapper: ThemeWrapper },
            );
            expect(screen.getAllByLabelText('Compose a document from this note')).toHaveLength(1);
            fireEvent.click(screen.getByLabelText('Compose a document from this note'));
            expect(onCompose).toHaveBeenCalledTimes(1);
        });

        it('locks Compose out while one is running', () => {
            const onCompose = vi.fn();
            render(
                <NoteActions onSave={mockOnSave} onDelete={mockOnDelete} onCompose={onCompose} isComposing variant={variant} />,
                { wrapper: ThemeWrapper },
            );
            expect(screen.getByLabelText('Compose a document from this note')).toBeDisabled();
        });
    });

    it('renders bottom-bar variant properly', () => {
        render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} variant="bottom-bar" />, { wrapper: ThemeWrapper });
        // In bottom bar, delete is a text button
        expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
    });
});
