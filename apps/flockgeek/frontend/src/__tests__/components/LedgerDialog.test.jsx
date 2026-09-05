import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, TextField } from '@mui/material';
import LedgerDialog from '../../components/primitives/LedgerDialog';
import { renderWithProviders, mockMatchMediaMatches } from '../testUtils';

const FORM_ID = 'bird-form';

function renderDialog({ onSubmit = vi.fn(), ...rest } = {}) {
  return renderWithProviders(
    <LedgerDialog
      open
      onClose={vi.fn()}
      title="Add bird"
      primaryAction={
        <Button type="submit" form={FORM_ID} variant="contained">
          Save
        </Button>
      }
      {...rest}
    >
      <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <TextField label="Name" />
      </form>
    </LedgerDialog>
  );
}

describe('LedgerDialog', () => {
  let restoreMatchMedia;
  afterEach(() => {
    restoreMatchMedia?.();
    restoreMatchMedia = undefined;
  });

  it('renders on GeekDialog with the serif display title', () => {
    restoreMatchMedia = mockMatchMediaMatches(false); // window mode
    renderDialog();
    const title = screen.getByText('Add bird');
    expect(title).toBeInTheDocument();
    expect(getComputedStyle(title).fontFamily).toContain('DM Serif Display');
  });

  it("associates the primary action with the form via the HTML form attribute", () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    renderDialog();
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toHaveAttribute('type', 'submit');
    expect(saveButton).toHaveAttribute('form', FORM_ID);
  });

  it('submits the form when the primary action is clicked', async () => {
    restoreMatchMedia = mockMatchMediaMatches(false);
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderDialog({ onSubmit });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('goes full-screen with a header close/title/action row below sm', () => {
    restoreMatchMedia = mockMatchMediaMatches(true); // full mode
    renderDialog();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByText('Add bird')).toBeInTheDocument();
  });
});
