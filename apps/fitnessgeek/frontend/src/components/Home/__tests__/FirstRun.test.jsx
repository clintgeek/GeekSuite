/**
 * Simple mode's first run: three plain steps, nothing to configure
 * (DOCS/SIMPLE_AND_FULL_PLAN.md, "Simple mode, specifically for Heather").
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FirstRun from '../FirstRun.jsx';

describe('FirstRun', () => {
  it('name → goal → try logging, and "Add my lunch" hands back both answers', () => {
    const onTryLogging = vi.fn();
    render(<FirstRun suggestedName="Heath" mealType="lunch" onTryLogging={onTryLogging} onFinish={vi.fn()} />);

    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    const name = screen.getByLabelText('Your name');
    expect(name).toHaveValue('Heath');
    fireEvent.change(name, { target: { value: 'Heather' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('heading', { name: 'Nice to meet you, Heather. What’s your goal?' })).toBeInTheDocument();
    const steady = screen.getByRole('radio', { name: /keep my weight steady/i });
    expect(steady).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(steady);
    expect(steady).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('heading', { name: 'Try logging your lunch' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add my lunch' }));
    expect(onTryLogging).toHaveBeenCalledWith({ preferred_name: 'Heather', goal: 'maintain' });
  });

  it('"Maybe later" finishes it too — nothing is required', () => {
    const onFinish = vi.fn();
    render(<FirstRun mealType="breakfast" onFinish={onFinish} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maybe later' }));
    // The gentlest goal is already chosen, so nothing had to be decided.
    expect(onFinish).toHaveBeenCalledWith({ preferred_name: null, goal: 'track' });
  });

  // Round two: "Next" was live over three empty circles.
  it('the goal step opens with the gentlest answer chosen, and exactly one', () => {
    render(<FirstRun mealType="breakfast" />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const checked = screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAccessibleName(/just keep track/i);
    expect(screen.getByRole('radio', { name: /^lose weight/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('takes over the screen as a welcome: a labelled full-screen dialog with the app’s name', () => {
    render(<FirstRun mealType="breakfast" />);
    const dialog = screen.getByRole('dialog', { name: 'Welcome! What should I call you?' });
    expect(dialog).toContainElement(screen.getByTestId('first-run'));
    expect(dialog).toHaveTextContent('FitnessGeek');
    expect(dialog.className).toMatch(/MuiDialog-paperFullScreen/);
  });

  it('Back keeps what was typed', () => {
    render(<FirstRun mealType="dinner" />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Heather' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Your name')).toHaveValue('Heather');
  });

  // 2026-11-27: it cannot dead-end.
  const toStep3 = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  };

  it('the last step has a way back, and the goal chosen is still chosen', () => {
    render(<FirstRun mealType="dinner" />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('radio', { name: /just keep track/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('radio', { name: /just keep track/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('a second tap while it saves does not finish twice', async () => {
    let done;
    const onFinish = vi.fn(() => new Promise((resolve) => { done = resolve; }));
    render(<FirstRun mealType="breakfast" onFinish={onFinish} onTryLogging={vi.fn()} />);
    toStep3();
    fireEvent.click(screen.getByRole('button', { name: 'Maybe later' }));
    expect(screen.getByRole('button', { name: 'Maybe later' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add my breakfast' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Maybe later' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    done({ ok: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Maybe later' })).not.toBeDisabled());
  });

  it('a save that fails says so here and can be tried again', async () => {
    const onFinish = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
    render(<FirstRun suggestedName="Heather" mealType="breakfast" onFinish={onFinish} />);
    toStep3();
    fireEvent.click(screen.getByRole('button', { name: 'Maybe later' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save that. Try again.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Maybe later' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Maybe later' }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(2));
    expect(onFinish).toHaveBeenLastCalledWith({ preferred_name: 'Heather', goal: 'track' });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('a save that throws does not leave the buttons dead', async () => {
    const onTryLogging = vi.fn().mockRejectedValue(new Error('boom'));
    render(<FirstRun mealType="breakfast" onTryLogging={onTryLogging} />);
    toStep3();
    fireEvent.click(screen.getByRole('button', { name: 'Add my breakfast' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add my breakfast' })).not.toBeDisabled();
  });
});
