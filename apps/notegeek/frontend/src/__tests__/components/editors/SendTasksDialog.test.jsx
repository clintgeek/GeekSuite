/**
 * SendTasksDialog — "Probably already sent", dates read from the day the page
 * was written (review 1.11, 2.10 / D6), and edits handed back as corrections.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { createNoteTheme } from '../../../theme/createAppTheme';
import SendTasksDialog from '../../../components/editors/SendTasksDialog';
import { sendTaskRows, sentKeysFor } from '../../../utils/journalLines';

const show = (props) => render(
  <ThemeProvider theme={createNoteTheme('light')}>
    <SendTasksDialog open stage="review" onToggle={vi.fn()} onTextChange={vi.fn()} onSend={vi.fn()} onClose={vi.fn()} {...props} />
  </ThemeProvider>
);

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(9, 0, 0, 0); return d; };

describe('SendTasksDialog', () => {
  it('a line close to one already sent says so, and arrives unticked', () => {
    const [first] = sendTaskRows('* call Bbo about the fence');
    const rows = sendTaskRows('* call Bob about the fence', sentKeysFor(first));
    show({ rows });
    expect(screen.getByText('Probably already sent')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /call Bob/ })).not.toBeChecked();
  });

  it('an older page reads its dates from the day it was written, with a switch', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const written = daysAgo(2);
    show({ rows: sendTaskRows('* call Bob tomorrow'), writtenAt: written.toISOString(), onSend });
    expect(screen.getByTestId('written-anchor')).toHaveTextContent(/^Written .* · dates read from then$/);
    // "tomorrow" is the day after the page, i.e. yesterday
    const due = new Date(written); due.setDate(due.getDate() + 1);
    expect(screen.getByText(new RegExp(`Due ${due.toLocaleDateString(undefined, { weekday: 'short' })}`))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Send 1 to TodoGeek/ }));
    expect(onSend.mock.calls[0][0].now.getTime()).toBe(written.getTime());
    await user.click(screen.getByRole('checkbox', { name: 'Read dates from that day' }));
    expect(screen.getByTestId('written-anchor')).toHaveTextContent(/dates read from today$/);
    await user.click(screen.getByRole('button', { name: /Send 1 to TodoGeek/ }));
    expect(onSend.mock.calls[1][0].now).toBeNull();
  });

  it("today's page shows no anchor line", () => {
    show({ rows: sendTaskRows('* call Bob tomorrow'), writtenAt: new Date().toISOString() });
    expect(screen.queryByTestId('written-anchor')).not.toBeInTheDocument();
  });

  it('words changed in the dialog are handed back as corrections on Send', async () => {
    const user = userEvent.setup();
    const onCorrections = vi.fn();
    const rows = sendTaskRows('Standup\n* call Bbo').map((r) => ({ ...r, text: 'call Bob' }));
    show({ rows, onCorrections });
    await user.click(screen.getByRole('button', { name: /Send 1 to TodoGeek/ }));
    expect(onCorrections).toHaveBeenCalledWith([{ line: 1, from: 'call Bbo', to: 'call Bob' }]);
  });
});
