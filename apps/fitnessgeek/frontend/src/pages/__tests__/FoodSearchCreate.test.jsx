/**
 * The look-up page's "Can't find it? Create …": the food is created, then
 * logged. It used to say "Added to lunch ✓" whatever the log answered, so a
 * food that was saved but never logged read as a success; and a failed
 * create must keep the form and what was typed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';

const logItems = vi.fn();
const createFood = vi.fn();

vi.mock('../../components/FoodSearch', () => ({
  FoodComposer: ({ onCreateFood }) => <button onClick={() => onCreateFood('granola')}>Create it</button>,
}));
vi.mock('../../components/BarcodeScanner/BarcodeScanner.jsx', () => ({ default: () => null }));
vi.mock('../../hooks/useFoodLogging.js', () => ({
  useFoodLogging: () => ({ logItems, undoLogs: vi.fn(), describeMeal: vi.fn(), adjustLogCalories: vi.fn(), createFood }),
}));

const { default: FoodSearchPage } = await import('../FoodSearch.jsx');
const openForm = () => {
  render(<GeekToastProvider><FoodSearchPage /></GeekToastProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Create it' }));
};

beforeEach(() => vi.clearAllMocks());

describe('Look up a food: create, then log', () => {
  it('says Added, with Undo, when the log was written', async () => {
    createFood.mockResolvedValue({ id: 'f1', name: 'granola' });
    logItems.mockResolvedValue({ ok: 1, fail: 0, logIds: ['l1'] });
    openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Save food' }));
    expect(await screen.findByText(/^Added to .* ✓ · granola$/)).toBeInTheDocument();
    expect(createFood).toHaveBeenCalledWith(expect.objectContaining({ name: 'granola', serving: { size: 1, unit: 'oz' } }));
  });

  it('does not say Added when the log failed; it says the food was saved', async () => {
    createFood.mockResolvedValue({ id: 'f1', name: 'granola' });
    logItems.mockResolvedValue({ ok: 0, fail: 1, logIds: [], errors: [new Error('nope')] });
    openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Save food' }));
    expect(await screen.findByText(/Saved granola to your foods, but couldn’t add it to today/)).toBeInTheDocument();
    expect(screen.queryByText(/^Added to/)).toBeNull();
  });

  it('a failed create keeps the form open with what was typed', async () => {
    createFood.mockRejectedValue(new Error('boom'));
    openForm();
    fireEvent.change(screen.getByLabelText(/^Brand/), { target: { value: 'Home' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save food' }));
    expect(await screen.findByText(/Couldn’t create that food|boom/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveValue('granola');
    expect(screen.getByLabelText(/^Brand/)).toHaveValue('Home');
    expect(logItems).not.toHaveBeenCalled();
  });
});
