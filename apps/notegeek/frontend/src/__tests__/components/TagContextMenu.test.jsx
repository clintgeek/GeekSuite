import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import TagContextMenu from '../../components/TagContextMenu';
import useTagStore from '../../store/tagStore';

const theme = createTheme();

vi.mock('../../store/tagStore', () => {
    const defaultStore = { renameTag: vi.fn(), deleteTag: vi.fn() };
    const useStore = vi.fn((selector) => (selector ? selector(defaultStore) : defaultStore));
    useStore.getState = () => defaultStore;
    useStore.setState = () => { };
    return { default: useStore };
});

describe('TagContextMenu', () => {
    let mockOnClose;

    beforeEach(() => {
        mockOnClose = vi.fn();
        vi.clearAllMocks();
        // Mock window.confirm
        vi.spyOn(window, 'confirm').mockImplementation(() => true);
    });

    it('renders menu items when open is true', () => {
        // Create a dummy element to anchor the menu to
        const anchor = document.createElement('div');
        render(<TagContextMenu anchorEl={anchor} open={true} onClose={mockOnClose} tag="my-tag" />, { wrapper: ThemeProvider });

        expect(screen.getByText('Rename Tag')).toBeInTheDocument();
        expect(screen.getByText('Delete Tag')).toBeInTheDocument();
    });

    it('calls deleteTag when Delete is clicked and confirmed', async () => {
        const anchor = document.createElement('div');
        render(<TagContextMenu anchorEl={anchor} open={true} onClose={mockOnClose} tag="my-tag" />, { wrapper: ThemeProvider });

        fireEvent.click(screen.getByText('Delete Tag'));

        expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete the tag "my-tag"? This cannot be undone.');
        expect(useTagStore.getState().deleteTag).toHaveBeenCalledWith('my-tag');
        expect(mockOnClose).toHaveBeenCalled();
    });

    it('opens rename dialog and calls renameTag on submit', async () => {
        const anchor = document.createElement('div');
        render(<TagContextMenu anchorEl={anchor} open={true} onClose={mockOnClose} tag="old-tag" />, { wrapper: ThemeProvider });

        // Click Rename Tag to open dialog
        fireEvent.click(screen.getByText('Rename Tag'));

        // Wait for dialog to appear
        const input = await screen.findByLabelText('New Tag Name');
        expect(input).toHaveValue('old-tag');

        // Change value
        fireEvent.change(input, { target: { value: 'new-tag' } });

        // Click Rename button
        fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

        expect(useTagStore.getState().renameTag).toHaveBeenCalledWith('old-tag', 'new-tag');
        expect(mockOnClose).toHaveBeenCalled();
    });
});
