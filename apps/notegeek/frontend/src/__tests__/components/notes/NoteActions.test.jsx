import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import NoteActions from '../../../components/notes/NoteActions';

const theme = createTheme();
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
        const saveBtn = screen.getByRole('button');
        // If it's loading, material UI usually doesn't have the text "Save" if it's replaced by spinner, but here we render no startIcon and just a spinner instead of text inside button. wait, actually:
        // {isSaving ? (<CircularProgress />) : isSaved ? 'Saved!' : 'Save'}
        // So the button will just have a progressbar role inside it but we can grab the button itself.
        // It should be disabled.
        expect(saveBtn).toBeDisabled();
    });

    it('shows "Saved!" when saveStatus is "Saved"', () => {
        render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} saveStatus="Saved" />, { wrapper: ThemeWrapper });
        expect(screen.getByRole('button', { name: /Saved!/i })).toBeInTheDocument();
    });

    it('renders bottom-bar variant properly', () => {
        render(<NoteActions onSave={mockOnSave} onDelete={mockOnDelete} variant="bottom-bar" />, { wrapper: ThemeWrapper });
        // In bottom bar, delete is a text button
        expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
    });
});
