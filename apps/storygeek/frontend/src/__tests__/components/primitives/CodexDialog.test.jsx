import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import Button from '@mui/material/Button';
import { lightTheme } from '../../testUtils';
import CodexDialog from '../../../components/primitives/CodexDialog';

function renderDialog(props) {
  return render(
    <ThemeProvider theme={lightTheme}>
      <CodexDialog open onClose={vi.fn()} title="Begin a New Tale" {...props} />
    </ThemeProvider>
  );
}

describe('CodexDialog', () => {
  it('renders the window-mode title hook when mode="window"', () => {
    renderDialog({ mode: 'window' });
    expect(document.querySelector('[data-geek-dialog="title"]')).not.toBeNull();
    expect(document.querySelector('[data-geek-dialog="header-title"]')).toBeNull();
  });

  it('renders the full-mode header hook when mode="full"', () => {
    renderDialog({ mode: 'full' });
    expect(document.querySelector('[data-geek-dialog="header-title"]')).not.toBeNull();
    expect(document.querySelector('[data-geek-dialog="title"]')).toBeNull();
  });

  it('submits the associated form when the primary action is clicked', () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    renderDialog({
      mode: 'full',
      primaryAction: (
        <Button type="submit" form="tale-form" variant="contained">
          Begin
        </Button>
      ),
      children: (
        <form id="tale-form" onSubmit={onSubmit}>
          <input defaultValue="a prompt" readOnly />
        </form>
      ),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('dims a disabled primary action', () => {
    renderDialog({
      mode: 'full',
      primaryAction: (
        <Button type="submit" form="tale-form" variant="contained" disabled>
          Begin
        </Button>
      ),
    });

    const button = screen.getByRole('button', { name: 'Begin' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('Mui-disabled');
    // CodexDialog's primaryActionSx dims disabled buttons through the
    // `[data-geek-dialog="primary"]` wrapper — assert the hook the styling
    // targets is actually present around the disabled button.
    const primaryBox = document.querySelector('[data-geek-dialog="primary"]');
    expect(primaryBox).not.toBeNull();
    expect(primaryBox).toContainElement(button);
  });
});
