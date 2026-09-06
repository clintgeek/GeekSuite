import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createBuJoTheme } from '../../theme/theme';
import ReviewNoteDialog from '../../components/review/ReviewNoteDialog';

/**
 * The editor the draft feeds. What matters is that it is an *ordinary* editor:
 * it seeds from whatever it is given, it hands a plain payload back, and the
 * `aiDrafted` mark travels with the save rather than being decided here.
 */
const theme = createBuJoTheme('light');

function renderDialog(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <ReviewNoteDialog open onClose={() => {}} {...props} />
    </ThemeProvider>
  );
}

describe('ReviewNoteDialog', () => {
  it('seeds from the draft and hands back what the user actually saves', () => {
    const onSave = vi.fn();
    renderDialog({
      initialTitle: 'Weekly review — 31 Aug – 6 Sep',
      initialContent: 'The week went like this.',
      aiDrafted: true,
      onSave,
    });

    const title = screen.getByLabelText(/title/i);
    expect(title).toHaveValue('Weekly review — 31 Aug – 6 Sep');

    fireEvent.change(screen.getByLabelText(/the week/i), { target: { value: 'Edited by hand.' } });
    fireEvent.click(screen.getByRole('button', { name: /save review/i }));

    expect(onSave).toHaveBeenCalledWith({
      title: 'Weekly review — 31 Aug – 6 Sep',
      content: 'Edited by hand.',
      aiDrafted: true,
    });
  });

  it('will not save an empty review', () => {
    const onSave = vi.fn();
    renderDialog({ initialTitle: '', initialContent: '', onSave });

    expect(screen.getByRole('button', { name: /save review/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /save review/i }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('says so when the entry will carry the AI-drafted mark, and stays quiet when it will not', () => {
    const { unmount } = renderDialog({ initialTitle: 'T', initialContent: 'C', aiDrafted: true });
    expect(screen.getByText(/AI-drafted mark/i)).toBeInTheDocument();
    unmount();

    renderDialog({ initialTitle: 'T', initialContent: 'C', aiDrafted: false });
    expect(screen.queryByText(/AI-drafted mark/i)).not.toBeInTheDocument();
  });
});
