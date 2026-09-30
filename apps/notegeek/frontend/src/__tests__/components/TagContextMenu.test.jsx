import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';
import TagContextMenu from '../../components/TagContextMenu';
import useTagStore from '../../store/tagStore';
import { NOTE_TAG_USAGE } from '../../graphql/queries';
import { deleteSummary, renameProblem } from '../../utils/tagPath';

vi.mock('../../store/tagStore', () => {
    const defaultStore = { renameTag: vi.fn(), deleteTag: vi.fn() };
    const useStore = vi.fn((selector) => (selector ? selector(defaultStore) : defaultStore));
    useStore.getState = () => defaultStore;
    useStore.setState = () => { };
    return { default: useStore };
});

const usageMock = (tag, notes, subTags) => ({
    request: { query: NOTE_TAG_USAGE, variables: { tag } },
    result: { data: { noteTagUsage: { notes, subTags } } },
});

const anchor = () => document.createElement('div');

describe('TagContextMenu', () => {
    let onClose;

    beforeEach(() => {
        onClose = vi.fn();
        vi.clearAllMocks();
        useTagStore.getState().renameTag.mockResolvedValue(undefined);
        useTagStore.getState().deleteTag.mockResolvedValue(undefined);
    });

    it('offers "Rename or move" and "Delete tag"', () => {
        renderWithProviders(<TagContextMenu anchorEl={anchor()} open onClose={onClose} tag="house" />);
        expect(screen.getByText('Rename or move')).toBeInTheDocument();
        expect(screen.getByText('Delete tag')).toBeInTheDocument();
    });

    it('rename: explains that sub-tags come along, and calls renameTag with the normalized path', async () => {
        renderWithProviders(<TagContextMenu anchorEl={anchor()} open onClose={onClose} tag="garage" />);
        fireEvent.click(screen.getByText('Rename or move'));

        const input = await screen.findByLabelText('Tag path');
        expect(input).toHaveValue('garage');
        expect(screen.getByText(/Sub-tags and their notes come along/)).toBeInTheDocument();

        fireEvent.change(input, { target: { value: ' house / garage ' } });
        // A new parent is a move.
        fireEvent.click(screen.getByRole('button', { name: 'Move' }));

        await waitFor(() => expect(useTagStore.getState().renameTag).toHaveBeenCalledWith('garage', 'house/garage'));
        await waitFor(() => expect(screen.queryByLabelText('Tag path')).not.toBeInTheDocument());
    });

    it('rename: refuses a move into its own descendant, with a friendly message, before calling anything', async () => {
        renderWithProviders(<TagContextMenu anchorEl={anchor()} open onClose={onClose} tag="house" />);
        fireEvent.click(screen.getByText('Rename or move'));
        const input = await screen.findByLabelText('Tag path');

        fireEvent.change(input, { target: { value: 'house/garage' } });

        expect(screen.getByText("#house can't move inside itself.")).toBeInTheDocument();
        const move = screen.getByRole('button', { name: /Move|Rename/ });
        expect(move).toBeDisabled();
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(useTagStore.getState().renameTag).not.toHaveBeenCalled();
    });

    it('rename: a normalized no-op closes without a round trip', async () => {
        renderWithProviders(<TagContextMenu anchorEl={anchor()} open onClose={onClose} tag="work" />);
        fireEvent.click(screen.getByText('Rename or move'));
        const input = await screen.findByLabelText('Tag path');
        fireEvent.change(input, { target: { value: ' work/ ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
        expect(useTagStore.getState().renameTag).not.toHaveBeenCalled();
    });

    it('rename: a server refusal stays in the dialog', async () => {
        useTagStore.getState().renameTag.mockRejectedValueOnce(new Error('#x… would be longer than 100 characters.'));
        renderWithProviders(<TagContextMenu anchorEl={anchor()} open onClose={onClose} tag="a" />);
        fireEvent.click(screen.getByText('Rename or move'));
        const input = await screen.findByLabelText('Tag path');
        fireEvent.change(input, { target: { value: 'b' } });
        fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
        expect(await screen.findByText(/would be longer than 100/)).toBeInTheDocument();
        expect(screen.getByLabelText('Tag path')).toBeInTheDocument();
    });

    it('delete: a real dialog (no window.confirm) that states the subtree and note counts', async () => {
        const confirm = vi.spyOn(window, 'confirm');
        renderWithProviders(
            <TagContextMenu anchorEl={anchor()} open onClose={onClose} tag="house" />,
            { mocks: [usageMock('house', 7, 2)] },
        );
        fireEvent.click(screen.getByText('Delete tag'));

        const dialog = await screen.findByRole('dialog');
        await waitFor(() =>
            expect(within(dialog).getByTestId('delete-tag-summary'))
                .toHaveTextContent('Removes #house and its 2 sub-tags from 7 notes. The notes stay.'));
        expect(confirm).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete tag' }));
        await waitFor(() => expect(useTagStore.getState().deleteTag).toHaveBeenCalledWith('house'));
    });

    it('delete: cancel deletes nothing', async () => {
        renderWithProviders(
            <TagContextMenu anchorEl={anchor()} open onClose={onClose} tag="house" />,
            { mocks: [usageMock('house', 1, 0)] },
        );
        fireEvent.click(screen.getByText('Delete tag'));
        const dialog = await screen.findByRole('dialog');
        await waitFor(() => expect(within(dialog).getByTestId('delete-tag-summary'))
            .toHaveTextContent('Removes #house from 1 note. The notes stay.'));
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        expect(useTagStore.getState().deleteTag).not.toHaveBeenCalled();
    });
});

describe('tag dialog copy', () => {
    it('deleteSummary pluralizes and drops the sub-tag clause at zero', () => {
        expect(deleteSummary('house', { notes: 7, subTags: 2 })).toBe('Removes #house and its 2 sub-tags from 7 notes. The notes stay.');
        expect(deleteSummary('house', { notes: 1, subTags: 1 })).toBe('Removes #house and its 1 sub-tag from 1 note. The notes stay.');
        expect(deleteSummary('house', { notes: 3, subTags: 0 })).toBe('Removes #house from 3 notes. The notes stay.');
    });
    it('renameProblem', () => {
        expect(renameProblem('house', 'house/garage')).toMatch(/inside itself/);
        expect(renameProblem('house', 'house / garage / door')).toMatch(/inside itself/);
        expect(renameProblem('house', 'houseboat')).toBeNull();
        expect(renameProblem('house/garage', 'house')).toBeNull();
        expect(renameProblem('house', ' / ')).toBe('A tag needs a name.');
        expect(renameProblem('house', 'house')).toBeNull();
    });
});
