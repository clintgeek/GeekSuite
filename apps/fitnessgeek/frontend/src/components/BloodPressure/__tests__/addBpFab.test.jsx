/**
 * On a phone the BP page's main action says what it does (review Phase 1.8):
 * the shell's FAB collapsed to an unlabelled "+" below `sm`.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QuickAddBP from '../QuickAddBP.jsx';

describe('QuickAddBP thumb button', () => {
  it('is labelled "Add BP" and opens the form', async () => {
    render(<QuickAddBP onAdd={async () => {}} />);
    const fab = screen.getByTestId('add-bp-fab');
    expect(fab).toHaveTextContent('Add BP');
    fireEvent.click(fab);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
