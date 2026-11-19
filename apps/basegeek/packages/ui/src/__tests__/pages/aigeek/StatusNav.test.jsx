import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import StatusNav from '../../../pages/aigeek/StatusNav';
import { renderWithProviders } from '../../testUtils';

describe('StatusNav', () => {
  it('is one row that scrolls inside itself on a phone, never a second sticky row', () => {
    renderWithProviders(<StatusNav attentionCount={6} hasWarning onJump={vi.fn()} />);
    const nav = screen.getByRole('navigation', { name: 'Status page sections' });
    expect(getComputedStyle(nav).flexWrap).toBe('nowrap');
    expect(getComputedStyle(nav).overflowX).toBe('auto');
  });

  it('puts the attention count after the word as a tag, not a badge over it', () => {
    renderWithProviders(<StatusNav attentionCount={6} hasWarning onJump={vi.fn()} />);
    expect(document.querySelector('.MuiBadge-badge')).toBeNull();
    const count = screen.getByTestId('attention-count');
    expect(count).toHaveTextContent('6');
    // Inside the attention button, after its label text.
    const button = count.closest('button');
    expect(within(button).getAllByText(/attention/i)[0].compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows no count when nothing needs attention', () => {
    renderWithProviders(<StatusNav attentionCount={0} onJump={vi.fn()} />);
    expect(screen.queryByTestId('attention-count')).toBeNull();
  });
});
