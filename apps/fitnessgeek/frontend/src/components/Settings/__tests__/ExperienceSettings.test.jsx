/**
 * Settings → "How it looks" (DOCS/ONE_APP_PLAN.md §2): Larger text, saved
 * the moment it is switched. There is one app now, so there is no Simple or
 * Full to choose, and nothing on the panel says either word.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';
import { ExperienceContext } from '../../../contexts/ExperienceContext.jsx';
import ExperienceSettings from '../ExperienceSettings.jsx';

const value = (over = {}) => ({
  largerText: false,
  setLargerText: vi.fn(() => Promise.resolve({ ok: true })),
  ...over,
});

const mount = (v, children = null) => render(
  <GeekToastProvider>
    <ExperienceContext.Provider value={v}>
      <ExperienceSettings>{children}</ExperienceSettings>
    </ExperienceContext.Provider>
  </GeekToastProvider>
);

describe('ExperienceSettings', () => {
  it('has no Simple / Full chooser, and says neither word', () => {
    mount(value());
    expect(screen.getByRole('heading', { name: 'How it looks' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByTestId('mode-simple')).toBeNull();
    expect(screen.queryByTestId('mode-full')).toBeNull();
    expect(screen.queryByTestId('simple-view-line')).toBeNull();
    expect(screen.getByTestId('experience-settings').textContent).not.toMatch(/Simple|Full/);
  });

  it('the Larger text switch shows the saved choice and saves a change', async () => {
    const v = value();
    mount(v);
    const toggle = screen.getByRole('checkbox', { name: 'Larger text' });
    expect(toggle).not.toBeChecked();
    await act(async () => { fireEvent.click(toggle); });
    expect(v.setLargerText).toHaveBeenCalledWith(true);
  });

  it('the Larger text switch says Saved', async () => {
    mount(value({ largerText: true }));
    expect(screen.getByRole('checkbox', { name: 'Larger text' })).toBeChecked();
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'Larger text' })); });
    expect(await within(screen.getByTestId('experience-settings')).findByRole('status')).toHaveTextContent('Saved');
  });

  it('a failed save says so', async () => {
    mount(value({ setLargerText: vi.fn(() => Promise.resolve({ ok: false })) }));
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'Larger text' })); });
    // Under the switch, where she is looking (the switch going back alone
    // reads as a mis-tap), as well as the toast.
    const panel = screen.getByTestId('experience-settings');
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Couldn’t save that. Try again.');
    expect(within(panel).queryByRole('status')).toBeNull();
  });

  it('holds the theme picker the page hands it', () => {
    mount(value(), <div data-testid="theme-picker" />);
    expect(screen.getByTestId('theme-picker')).toBeInTheDocument();
  });
});
