import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DownloadSheet from '../../views/detail/DownloadSheet';
import { renderWithProviders } from '../testUtils';

const comic = {
  id: 'b9',
  title: 'Berserk',
  files: [{ format: 'CBZ', path: 'uploads/b9/berserk-03.cbz', size: 250 * 1024 * 1024 }],
};
const novel = {
  id: 'b1',
  title: 'Lock In',
  files: [{ format: 'EPUB', path: 'a/b/lock-in.epub', size: 1200000 }],
};

describe('DownloadSheet', () => {
  it('a comic offers its archive, with its size, and no ebook conversions', async () => {
    const handleDownload = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <DownloadSheet open onClose={() => {}} book={comic} convertingFormat={null} handleDownload={handleDownload} />,
    );
    expect(await screen.findByText('CBZ')).toBeInTheDocument();
    expect(screen.getByText('250.0 MB')).toBeInTheDocument();
    expect(screen.queryByText('EPUB')).not.toBeInTheDocument();
    expect(screen.queryByText('MOBI')).not.toBeInTheDocument();
    expect(screen.getByText('Comic files download as they are.')).toBeInTheDocument();

    await user.click(screen.getByText('CBZ'));
    expect(handleDownload).toHaveBeenCalledWith(comic, 'cbz');
  });

  it('an ordinary book still offers the three ebook formats', async () => {
    renderWithProviders(
      <DownloadSheet open onClose={() => {}} book={novel} convertingFormat={null} handleDownload={() => {}} />,
    );
    expect(await screen.findByText('EPUB')).toBeInTheDocument();
    expect(screen.getByText('AZW3')).toBeInTheDocument();
    expect(screen.getByText('MOBI')).toBeInTheDocument();
    expect(screen.getAllByText('Not available')).toHaveLength(2);
    expect(screen.queryByText('CBZ')).not.toBeInTheDocument();
  });
});
