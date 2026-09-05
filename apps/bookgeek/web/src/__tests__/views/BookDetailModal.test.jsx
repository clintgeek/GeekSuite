import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookDetailModal from '../../views/BookDetailModal';
import { BOOKS, SHELVES } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const book = BOOKS[0]; // "Lock In" — reading, 42%, has an epub file, rated 4

function baseProps(overrides = {}) {
  return {
    basketBookIds: [],
    beginEditForSelectedBook: vi.fn(),
    cancelEditForSelectedBook: vi.fn(),
    closeBookModal: vi.fn(),
    convertingFormat: null,
    coverApplyLoadingId: null,
    coverDeleteLoading: false,
    coverSearchError: null,
    coverSearchLoading: false,
    coverSearchQuery: '',
    coverSearchResults: [],
    coverUploadFile: null,
    coverUploadLoading: false,
    deleteConfirmOpen: false,
    deleteError: null,
    deleteIncludeFiles: false,
    deleteLoading: false,
    downloadOpen: false,
    editDraft: {},
    editError: null,
    editMode: false,
    editSaving: false,
    enrichError: null,
    enrichLoading: false,
    enrichSummary: null,
    handleApplyCoverCandidate: vi.fn(),
    handleCoverFileChange: vi.fn(),
    handleDeleteCoverForSelectedBook: vi.fn(),
    handleDeleteSelectedBook: vi.fn(),
    handleDownload: vi.fn(),
    handleEnrichSelectedBook: vi.fn(),
    handleSaveEditForSelectedBook: vi.fn(),
    handleSearchCoversForSelectedBook: vi.fn(),
    handleSendToKindle: vi.fn(),
    handleUpdateProgress: vi.fn(),
    handleUpdateShelf: vi.fn(),
    handleUploadBookFile: vi.fn(),
    handleUploadCoverForSelectedBook: vi.fn(),
    handleUploadFileChange: vi.fn(),
    progressDraft: 42,
    progressError: null,
    progressSavingId: null,
    scheduleProgressCommit: vi.fn(),
    selectedBook: book,
    sendToKindleError: null,
    sendToKindleLoading: false,
    sendToKindleStatus: null,
    setCoverSearchQuery: vi.fn(),
    setDeleteConfirmOpen: vi.fn(),
    setDeleteError: vi.fn(),
    setDeleteIncludeFiles: vi.fn(),
    setDownloadOpen: vi.fn(),
    setEditDraft: vi.fn(),
    setProgressDraft: vi.fn(),
    setReaderError: vi.fn(),
    setReaderOpen: vi.fn(),
    setShowCoverTools: vi.fn(),
    shelfSavingId: null,
    shelves: SHELVES,
    showCoverTools: false,
    toggleBasket: vi.fn(),
    uploadError: null,
    uploadFile: null,
    uploadLoading: false,
    uploadMessage: null,
    ...overrides,
  };
}

describe('BookDetailModal', () => {
  it('renders nothing with no selected book', () => {
    const { container } = renderWithProviders(<BookDetailModal {...baseProps({ selectedBook: null })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the hero: title, authors, rating, page count, year and shelf', () => {
    renderWithProviders(<BookDetailModal {...baseProps()} />);
    // GeekSheet's dialog-mode header carries the same accessible name (an
    // offscreen h3 wrapped in MUI's own DialogTitle h2) as DetailHero's own
    // visible heading — scope to the scrolling body to get DetailHero's.
    const body = document.querySelector('[data-geek-sheet="body"]');
    expect(within(body).getByRole('heading', { name: 'Lock In' })).toBeInTheDocument();
    expect(screen.getByText('John Scalzi')).toBeInTheDocument();
    expect(screen.getByText('★★★★☆')).toBeInTheDocument();
    expect(screen.getByText('336 pp')).toBeInTheDocument();
    expect(screen.getByText('2014')).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
  });

  it('enables Read when the book has an epub file', () => {
    renderWithProviders(<BookDetailModal {...baseProps()} />);
    // Exact name, not a substring match — the description's own "Read more"
    // toggle button would otherwise also match.
    expect(screen.getByRole('button', { name: 'Read' })).toBeEnabled();
  });

  it('disables Read when the book has no epub file', () => {
    const noEpub = { ...book, files: [] };
    renderWithProviders(<BookDetailModal {...baseProps({ selectedBook: noEpub })} />);
    expect(screen.getByRole('button', { name: 'Read' })).toBeDisabled();
  });

  it('commits the progress slider on change, via scheduleProgressCommit and handleUpdateProgress', () => {
    const setProgressDraft = vi.fn();
    const scheduleProgressCommit = vi.fn();
    const handleUpdateProgress = vi.fn();
    renderWithProviders(
      <BookDetailModal
        {...baseProps({ progressDraft: 42, setProgressDraft, scheduleProgressCommit, handleUpdateProgress })}
      />
    );
    const slider = screen.getByRole('slider', { name: 'Percent read' });
    // jsdom has no layout engine, so a bare arrow key never reaches the range
    // input's native step-by-1 behavior the browser would apply. The
    // Shift+Arrow "big step" shortcut is handled explicitly in MUI's own JS
    // (not left to the browser), so it fires reliably here — shiftStep
    // defaults to 10, so 42 -> 52.
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true });
    expect(setProgressDraft).toHaveBeenCalledWith(52);
    expect(scheduleProgressCommit).toHaveBeenCalledWith(book, 52);
    expect(handleUpdateProgress).toHaveBeenCalledWith(book, 52);
  });

  it('opens the Shelf sheet and calls handleUpdateShelf, including "" for "No shelf"', async () => {
    const user = userEvent.setup();
    const handleUpdateShelf = vi.fn();
    renderWithProviders(<BookDetailModal {...baseProps({ handleUpdateShelf })} />);
    await user.click(screen.getByRole('button', { name: 'Shelf' }));
    const noShelfRow = await screen.findByText('No shelf');
    await user.click(noShelfRow);
    expect(handleUpdateShelf).toHaveBeenCalledWith(book, '');
  });

  it('the Shelf sheet also offers the real shelves, calling handleUpdateShelf with their id', async () => {
    const user = userEvent.setup();
    const handleUpdateShelf = vi.fn();
    renderWithProviders(<BookDetailModal {...baseProps({ handleUpdateShelf })} />);
    await user.click(screen.getByRole('button', { name: 'Shelf' }));
    const wantToRead = await screen.findByText('Want to read');
    await user.click(wantToRead);
    expect(handleUpdateShelf).toHaveBeenCalledWith(book, 'want-to-read');
  });

  it('opens the More sheet and lists its actions', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BookDetailModal {...baseProps({ basketBookIds: [] })} />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(await screen.findByText('Edit metadata')).toBeInTheDocument();
    expect(screen.getByText('Enrich metadata')).toBeInTheDocument();
    expect(screen.getByText('Change cover')).toBeInTheDocument();
    expect(screen.getByText('Download / Convert')).toBeInTheDocument();
    expect(screen.getByText('Upload book file')).toBeInTheDocument();
    expect(screen.getByText('Add to device basket')).toBeInTheDocument();
    expect(screen.getByText('Delete book…')).toBeInTheDocument();
  });

  it('the More sheet offers "Remove from device basket" once the book is already in it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BookDetailModal {...baseProps({ basketBookIds: ['b1'] })} />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(await screen.findByText('Remove from device basket')).toBeInTheDocument();
  });

  it('More → "Delete book…" opens the delete confirm dialog', async () => {
    const user = userEvent.setup();
    const setDeleteConfirmOpen = vi.fn();
    renderWithProviders(<BookDetailModal {...baseProps({ setDeleteConfirmOpen })} />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByText('Delete book…'));
    expect(setDeleteConfirmOpen).toHaveBeenCalledWith(true);
  });

  it('the delete confirm dialog toggles the "Also delete files" flag', async () => {
    const user = userEvent.setup();
    const setDeleteIncludeFiles = vi.fn();
    renderWithProviders(
      <BookDetailModal {...baseProps({ deleteConfirmOpen: true, setDeleteIncludeFiles })} />
    );
    expect(screen.getByText('Delete this book?')).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox', { name: 'Also delete files' });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(setDeleteIncludeFiles).toHaveBeenCalledWith(true);
  });

  it('the delete confirm dialog shows checked state and calls the delete handler', async () => {
    const user = userEvent.setup();
    const handleDeleteSelectedBook = vi.fn();
    renderWithProviders(
      <BookDetailModal
        {...baseProps({ deleteConfirmOpen: true, deleteIncludeFiles: true, handleDeleteSelectedBook })}
      />
    );
    expect(screen.getByRole('checkbox', { name: 'Also delete files' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(handleDeleteSelectedBook).toHaveBeenCalledTimes(1);
  });
});
