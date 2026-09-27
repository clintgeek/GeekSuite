/**
 * Settings → "How FitnessGeek looks": Simple or Full, and Larger text, each
 * saved the moment it is chosen (DOCS/SIMPLE_AND_FULL_PLAN.md item 5).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';
import { ExperienceContext } from '../../../contexts/ExperienceContext.jsx';
import ExperienceSettings from '../ExperienceSettings.jsx';

const value = (over = {}) => ({
  effectiveMode: 'simple',
  savedMode: null,
  largerText: false,
  setMode: vi.fn(() => Promise.resolve({ ok: true })),
  setLargerText: vi.fn(() => Promise.resolve({ ok: true })),
  ...over,
});

const mount = (v) => render(
  <GeekToastProvider>
    <ExperienceContext.Provider value={v}>
      <ExperienceSettings />
    </ExperienceContext.Provider>
  </GeekToastProvider>
);

describe('ExperienceSettings', () => {
  it('shows the mode being seen, and says when it was never chosen', () => {
    mount(value());
    expect(screen.getByRole('radio', { name: /^Simple/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /^Full/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/You haven't chosen yet, so you're seeing Simple/)).toBeInTheDocument();
  });

  it('choosing Full saves Full', async () => {
    const v = value();
    mount(v);
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: /^Full/ })); });
    expect(v.setMode).toHaveBeenCalledWith('full');
  });

  it('the Larger text switch saves it', async () => {
    const v = value({ savedMode: 'simple' });
    mount(v);
    const toggle = screen.getByRole('checkbox', { name: 'Larger text' });
    expect(toggle).not.toBeChecked();
    await act(async () => { fireEvent.click(toggle); });
    expect(v.setLargerText).toHaveBeenCalledWith(true);
  });
});
