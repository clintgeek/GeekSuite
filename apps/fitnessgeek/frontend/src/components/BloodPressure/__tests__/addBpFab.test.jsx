/**
 * On a phone the BP page's main action says what it does (review Phase 1.8):
 * the shell's FAB collapsed to an unlabelled "+" below `sm`. Since 2026-11-27
 * it is a full-width button in the page, not a floating one (it sat on top of
 * the page's text), and it says "blood pressure", not "BP".
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QuickAddBP from '../QuickAddBP.jsx';

describe('QuickAddBP thumb button', () => {
  it('is labelled "Log blood pressure", is in the page (not portalled), and opens the form', async () => {
    const { container } = render(<QuickAddBP onAdd={async () => {}} />);
    const fab = screen.getByTestId('add-bp-fab');
    expect(fab).toHaveTextContent('Log blood pressure');
    expect(container).toContainElement(fab);
    fireEvent.click(fab);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
