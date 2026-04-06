import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the API module BEFORE importing the store
vi.mock('../../services/api', () => ({
    getNotesApi: vi.fn(),
    getNoteByIdApi: vi.fn(),
    createNoteApi: vi.fn(),
    updateNoteApi: vi.fn(),
    deleteNoteApi: vi.fn(),
    searchNotesApi: vi.fn(),
}));

import useNoteStore from '../../store/noteStore';
import {
    getNotesApi,
    getNoteByIdApi,
    createNoteApi,
    updateNoteApi,
    deleteNoteApi,
    searchNotesApi,
} from '../../services/api';

describe('useNoteStore', () => {
    // Initial state to reset to
    const initialState = useNoteStore.getState();

    beforeEach(() => {
        useNoteStore.setState(initialState, true);
        vi.clearAllMocks();
        vi.useFakeTimers(); // Needed for debounce timers in the store
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    // =========================================================================
    // fetchNotes
    // =========================================================================
    describe('fetchNotes', () => {
        it('should set notes from paginated response on success', async () => {
            const mockNotes = [{ id: 1, title: 'Note 1' }];
            getNotesApi.mockResolvedValueOnce({ data: { notes: mockNotes, pagination: {} } });

            const promise = useNoteStore.getState().fetchNotes();

            expect(useNoteStore.getState().isLoadingList).toBe(true);
            await promise;

            const state = useNoteStore.getState();
            expect(state.isLoadingList).toBe(false);
            expect(state.notes).toEqual(mockNotes);
            expect(state.listError).toBeNull();
        });

        it('should fallback to parsing array response if not paginated', async () => {
            const mockNotes = [{ id: 1, title: 'Note 1' }];
            getNotesApi.mockResolvedValueOnce({ data: mockNotes });

            await useNoteStore.getState().fetchNotes();

            const state = useNoteStore.getState();
            expect(state.notes).toEqual(mockNotes);
        });

        it('should set listError on failure', async () => {
            getNotesApi.mockRejectedValueOnce({
                response: { data: { message: 'API Error' } }
            });

            await useNoteStore.getState().fetchNotes();

            const state = useNoteStore.getState();
            expect(state.isLoadingList).toBe(false);
            expect(state.listError).toBe('API Error');
            expect(state.notes).toEqual([]);
        });

        it('should guard against concurrent loading', async () => {
            getNotesApi.mockResolvedValueOnce({ data: [] });

            // Set loading state actively to simulate concurrent request
            useNoteStore.setState({ isLoadingList: true });

            await useNoteStore.getState().fetchNotes();

            expect(getNotesApi).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // fetchNoteById
    // =========================================================================
    describe('fetchNoteById', () => {
        it('should return note and set state on success', async () => {
            const mockNote = { _id: '123', title: 'Test Note' };
            getNoteByIdApi.mockResolvedValueOnce({ data: mockNote });

            const promise = useNoteStore.getState().fetchNoteById('123');

            expect(useNoteStore.getState().isLoadingSelected).toBe(true);
            expect(useNoteStore.getState().lastFetchedNoteId).toBe('123');

            const result = await promise;

            expect(result).toEqual(mockNote);
            expect(useNoteStore.getState().pendingNote).toEqual(mockNote);

            // Fast-forward the debounce timer
            vi.runAllTimers();

            const state = useNoteStore.getState();
            expect(state.isLoadingSelected).toBe(false);
            expect(state.selectedNote).toEqual(mockNote);
            expect(state.pendingNote).toBeNull();
        });

        it('should handle locked note message', async () => {
            const mockNote = { _id: '123', isLocked: true, message: 'Locked' };
            getNoteByIdApi.mockResolvedValueOnce({ data: mockNote });

            await useNoteStore.getState().fetchNoteById('123');

            expect(useNoteStore.getState().selectedError).toBe('Locked');
        });

        it('should set selectedError on 401 Unauthorized', async () => {
            getNoteByIdApi.mockRejectedValueOnce({ response: { status: 401 } });

            await useNoteStore.getState().fetchNoteById('123');

            const state = useNoteStore.getState();
            expect(state.selectedError).toContain('Authentication error');
            expect(state.selectedNote).toBeNull();
        });

        it('should set selectedError on 404 Not Found', async () => {
            getNoteByIdApi.mockRejectedValueOnce({ response: { status: 404 } });

            await useNoteStore.getState().fetchNoteById('123');

            const state = useNoteStore.getState();
            expect(state.selectedError).toBe('Note not found');
            expect(state.selectedNote).toBeNull();
        });

        it('should set general selectedError on other failures', async () => {
            getNoteByIdApi.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Server fail' } } });

            await useNoteStore.getState().fetchNoteById('123');

            const state = useNoteStore.getState();
            expect(state.selectedError).toBe('Server fail');
            expect(state.selectedNote).toBeNull();
        });

        it('should guard against concurrent loading', async () => {
            getNoteByIdApi.mockResolvedValueOnce({ data: { _id: '1' } });
            useNoteStore.setState({ isLoadingSelected: true });

            await useNoteStore.getState().fetchNoteById('123');
            expect(getNoteByIdApi).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // createNote
    // =========================================================================
    describe('createNote', () => {
        it('should set selectedNote on success', async () => {
            const newNote = { _id: '1', title: 'New' };
            createNoteApi.mockResolvedValueOnce({ data: newNote });

            const result = await useNoteStore.getState().createNote({ title: 'New' });

            const state = useNoteStore.getState();
            expect(result).toEqual(newNote);
            expect(state.selectedNote).toEqual(newNote);
            expect(state.isLoadingSelected).toBe(false);
            expect(state.selectedError).toBeNull();
        });

        it('should set selectedError on failure', async () => {
            createNoteApi.mockRejectedValueOnce({ response: { data: { message: 'Create failed' } } });

            const result = await useNoteStore.getState().createNote({ title: 'New' });

            const state = useNoteStore.getState();
            expect(result).toBeNull();
            expect(state.selectedError).toBe('Create failed');
            expect(state.isLoadingSelected).toBe(false);
        });
    });

    // =========================================================================
    // updateNote
    // =========================================================================
    describe('updateNote', () => {
        it('should set selectedNote on success', async () => {
            const updatedNote = { _id: '1', title: 'Updated' };
            updateNoteApi.mockResolvedValueOnce({ data: updatedNote });

            const result = await useNoteStore.getState().updateNote('1', { title: 'Updated' });

            const state = useNoteStore.getState();
            expect(result).toEqual(updatedNote);
            expect(state.selectedNote).toEqual(updatedNote);
            expect(state.isLoadingSelected).toBe(false);
            expect(state.selectedError).toBeNull();
        });

        it('should set selectedError on failure', async () => {
            updateNoteApi.mockRejectedValueOnce({ response: { data: { message: 'Update failed' } } });

            const result = await useNoteStore.getState().updateNote('1', { title: 'Updated' });

            const state = useNoteStore.getState();
            expect(result).toBeNull();
            expect(state.selectedError).toBe('Update failed');
            expect(state.isLoadingSelected).toBe(false);
        });
    });

    // =========================================================================
    // deleteNote
    // =========================================================================
    describe('deleteNote', () => {
        it('should clear selectedNote and refetch on success', async () => {
            deleteNoteApi.mockResolvedValueOnce({});
            // Mock fetchNotes to resolve quickly
            getNotesApi.mockResolvedValueOnce({ data: [] });

            useNoteStore.setState({ selectedNote: { _id: '1' } });

            const result = await useNoteStore.getState().deleteNote('1');

            const state = useNoteStore.getState();
            expect(result).toBe(true);
            expect(state.selectedNote).toBeNull();
            expect(getNotesApi).toHaveBeenCalled();
        });

        it('should set selectedError on failure', async () => {
            deleteNoteApi.mockRejectedValueOnce({ response: { data: { message: 'Delete failed' } } });

            const result = await useNoteStore.getState().deleteNote('1');

            const state = useNoteStore.getState();
            expect(result).toBe(false);
            expect(state.selectedError).toBe('Delete failed');
            expect(state.isLoadingSelected).toBe(false);
        });
    });

    // =========================================================================
    // searchNotes
    // =========================================================================
    describe('searchNotes', () => {
        it('should set searchResults on success', async () => {
            const results = [{ _id: '1', title: 'Found' }];
            searchNotesApi.mockResolvedValueOnce({ data: results });

            await useNoteStore.getState().searchNotes('query');

            const state = useNoteStore.getState();
            expect(state.searchResults).toEqual(results);
            expect(state.isSearching).toBe(false);
            expect(state.searchError).toBeNull();
        });

        it('should set searchError on failure', async () => {
            searchNotesApi.mockRejectedValueOnce(new Error('Search failed'));

            await useNoteStore.getState().searchNotes('query');

            const state = useNoteStore.getState();
            expect(state.searchResults).toEqual([]);
            expect(state.isSearching).toBe(false);
            expect(state.searchError).toBe('Search failed');
        });
    });

    // =========================================================================
    // Helper Actions
    // =========================================================================
    describe('Helpers (clearNotes, clearSelectedNote, clearSearchResults)', () => {
        it('clearNotes should reset all state', () => {
            useNoteStore.setState({
                notes: [{ _id: '1' }],
                selectedNote: { _id: '1' },
                isLoadingList: true,
                listError: 'error',
                searchResults: [{}],
            });

            useNoteStore.getState().clearNotes();

            expect(useNoteStore.getState()).toEqual(expect.objectContaining(initialState));
        });

        it('clearSelectedNote should clear selection if not loading', () => {
            useNoteStore.setState({ selectedNote: { _id: '1' }, isLoadingSelected: false });

            useNoteStore.getState().clearSelectedNote();

            expect(useNoteStore.getState().selectedNote).toBeNull();
        });

        it('clearSelectedNote should NOT clear selection if loading', () => {
            const note = { _id: '1' };
            useNoteStore.setState({ selectedNote: note, isLoadingSelected: true });

            useNoteStore.getState().clearSelectedNote();

            expect(useNoteStore.getState().selectedNote).toEqual(note);
        });

        it('clearSearchResults should clear search state', () => {
            useNoteStore.setState({ searchResults: [{}], searchError: 'error' });

            useNoteStore.getState().clearSearchResults();

            expect(useNoteStore.getState().searchResults).toEqual([]);
            expect(useNoteStore.getState().searchError).toBeNull();
        });
    });
});
