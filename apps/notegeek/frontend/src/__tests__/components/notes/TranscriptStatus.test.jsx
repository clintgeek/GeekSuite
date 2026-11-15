/**
 * TranscriptStatus — tappable, with "Transcribe now" and "View text"
 * (review 2.11), and a warning for a page too long to read well (2.7).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { createNoteTheme } from '../../../theme/createAppTheme';
import TranscriptStatus from '../../../components/notes/TranscriptStatus';

const show = (view, props = {}) => render(<ThemeProvider theme={createNoteTheme('light')}><TranscriptStatus view={view} {...props} /></ThemeProvider>);

describe('TranscriptStatus', () => {
  it('"needs retry" is a button, and offers Transcribe now', async () => {
    const user = userEvent.setup();
    const onTranscribeNow = vi.fn();
    show({ status: 'failed', autoEnabled: true, error: 'The model read nothing.' }, { onTranscribeNow });
    await user.click(screen.getByRole('button', { name: /needs retry/ }));
    expect(screen.getByText(/The model read nothing/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Transcribe now' }));
    expect(onTranscribeNow).toHaveBeenCalledTimes(1);
  });

  it('a searchable page shows its text without going through Convert', async () => {
    const user = userEvent.setup();
    show({ status: 'searchable', autoEnabled: true, current: true, text: '* buy milk\n- eggs', model: 'gpt-4.1-mini' }, { onTranscribeNow: vi.fn() });
    await user.click(screen.getByRole('button', { name: /searchable/ }));
    expect(screen.queryByRole('button', { name: 'Transcribe now' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View text' }));
    expect(await screen.findByRole('dialog', { name: /The handwriting, as read/ })).toBeInTheDocument();
    expect(screen.getByText(/buy milk/)).toBeInTheDocument();
  });

  it('warns when the page is too long to read well', () => {
    show({ status: 'searchable', autoEnabled: true, tooLong: true });
    expect(screen.getByRole('button', { name: /page too long to read well/ })).toBeInTheDocument();
  });
});
