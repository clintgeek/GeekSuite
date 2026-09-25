import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import UnlinkMetadataDialog from '../../views/detail/UnlinkMetadataDialog';
import { renderWithProviders } from '../testUtils';

describe('UnlinkMetadataDialog', () => {
  it('explains what unlinking does before confirming', () => {
    renderWithProviders(<UnlinkMetadataDialog open title="Hades" onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText(/removes the details and cover art that were filled in automatically/)).toBeInTheDocument();
    expect(screen.getByText(/anything/)).toHaveTextContent("you've edited yourself stays");
  });

  it('calls onConfirm when Unlink is pressed', async () => {
    const onConfirm = vi.fn().mockResolvedValue();
    renderWithProviders(<UnlinkMetadataDialog open title="Hades" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('does not call onConfirm when the person backs out', () => {
    const onConfirm = vi.fn();
    renderWithProviders(<UnlinkMetadataDialog open title="Hades" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
