import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditMetadataDialog from '../../views/detail/EditMetadataDialog';
import { renderWithProviders } from '../testUtils';

function props(over = {}) {
  return {
    open: true,
    editDraft: { title: 'Lock In', authors: 'John Scalzi', description: '', tags: '' },
    editError: null,
    editSaving: false,
    setEditDraft: vi.fn(),
    handleSaveEditForSelectedBook: vi.fn(),
    cancelEditForSelectedBook: vi.fn(),
    ...over,
  };
}

const DRAFT_BUTTON = { name: /Draft description & tags/i };

describe('EditMetadataDialog — the metadata draft button', () => {
  it('is absent entirely when the Library assistant switch is off', () => {
    renderWithProviders(<EditMetadataDialog {...props()} />);
    expect(screen.queryByRole('button', DRAFT_BUTTON)).not.toBeInTheDocument();
  });

  it('appears when the switch is on and asks App for a draft', async () => {
    const handleDraftMetadata = vi.fn();
    renderWithProviders(
      <EditMetadataDialog {...props({ metadataDraftEnabled: true, handleDraftMetadata })} />
    );
    await userEvent.click(screen.getByRole('button', DRAFT_BUTTON));
    expect(handleDraftMetadata).toHaveBeenCalledTimes(1);
  });

  it('marks a drafted result AI-drafted and says to review it before saving', () => {
    renderWithProviders(
      <EditMetadataDialog
        {...props({
          metadataDraftEnabled: true,
          metadataDraftProvenance: { source: 'model', model: 'llama-3.1-8b' },
        })}
      />
    );
    expect(screen.getByText('AI-drafted')).toBeInTheDocument();
    expect(
      screen.getByText('AI-drafted by llama-3.1-8b — review before saving')
    ).toBeInTheDocument();
  });

  it('says plainly when no model was consulted', () => {
    renderWithProviders(
      <EditMetadataDialog
        {...props({
          metadataDraftEnabled: true,
          metadataDraftProvenance: { source: 'fallback', reason: 'unavailable' },
        })}
      />
    );
    expect(
      screen.getByText("No model — tags from this author's other books, no description")
    ).toBeInTheDocument();
  });

  it('reports a failed draft inline and leaves the form usable', () => {
    renderWithProviders(
      <EditMetadataDialog
        {...props({ metadataDraftEnabled: true, metadataDraftError: 'aiGeek did not answer.' })}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('aiGeek did not answer.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('does not ask twice while a draft is in flight', () => {
    renderWithProviders(
      <EditMetadataDialog {...props({ metadataDraftEnabled: true, metadataDraftLoading: true })} />
    );
    expect(screen.getByRole('button', { name: /Drafting…/ })).toBeDisabled();
  });

  it('edits the Description field, which the ordinary Save writes', async () => {
    const setEditDraft = vi.fn();
    renderWithProviders(<EditMetadataDialog {...props({ setEditDraft })} />);
    const field = screen.getByLabelText('Description');
    await userEvent.type(field, 'A');
    expect(setEditDraft).toHaveBeenCalled();
  });
});
