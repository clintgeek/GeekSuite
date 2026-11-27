/**
 * Import a scan, as a person who has never seen it meets it: the title once
 * (the top bar has it), plain words about what to bring, a failure said in
 * the card with the way to try again, and after a save the way to see it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const uploadBodyCompFile = vi.fn();
const extractBodyCompUpload = vi.fn();
vi.mock('../../services/bodyCompUploadService.js', () => ({
  fetchStagedShareFile: vi.fn(),
  uploadBodyCompFile: (...a) => uploadBodyCompFile(...a),
  extractBodyCompUpload: (...a) => extractBodyCompUpload(...a),
  acceptBodyCompUpload: vi.fn(),
  importBodyCompXlsx: vi.fn(),
}));
const notify = vi.fn();
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify }),
}));

const { default: ScanImport } = await import('../ScanImport.jsx');

const renderAt = (url = '/scan-import') => render(<MemoryRouter initialEntries={[url]}><ScanImport /></MemoryRouter>);
const pick = () => {
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [new File(['x'], 'scan.pdf', { type: 'application/pdf' })] } });
};

beforeEach(() => {
  uploadBodyCompFile.mockReset();
  extractBodyCompUpload.mockReset();
  notify.mockReset();
});

describe('Import a scan', () => {
  it('does not repeat the top bar\'s title, and says what to bring in plain words', () => {
    renderAt();
    expect(screen.queryByRole('heading', { name: 'Import a scan' })).toBeNull();
    expect(screen.getByText(/if your scale measures body fat/i)).toBeInTheDocument();
    expect(screen.getByText('Choose file')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Nextcloud|Arboleaf|xlsx/i);
  });

  it('a failed upload is said in the card, once, with the way to try again', async () => {
    uploadBodyCompFile.mockRejectedValue(new Error('Network Error'));
    renderAt();
    pick();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Choose a file again')).toBeInTheDocument();
    // In the card where the person is looking; no second copy in a toast.
    expect(notify).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tone: 'error' }));
  });

  it('after a save, the filled button goes to the Weight page', async () => {
    uploadBodyCompFile.mockResolvedValue({ id: 'u1', mimeType: 'application/pdf', size: 2048 });
    extractBodyCompUpload.mockResolvedValue({ status: 'saved' });
    renderAt();
    pick();
    expect(await screen.findByText('Scan saved')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See it on your Weight page' })).toHaveAttribute('href', '/weight#body-composition');
    expect(screen.getByText('Choose another file')).toBeInTheDocument();
  });

  it('a scan that did not save offers no link to see it', async () => {
    uploadBodyCompFile.mockResolvedValue({ id: 'u1', mimeType: 'application/pdf', size: 2048 });
    extractBodyCompUpload.mockResolvedValue({ status: 'extraction_failed' });
    renderAt();
    pick();
    expect(await screen.findByText('Couldn’t read this scan right now')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /weight page/i })).toBeNull();
  });
});
