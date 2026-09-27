/**
 * Simple mode's first run: three plain steps, nothing to configure
 * (DOCS/SIMPLE_AND_FULL_PLAN.md, "Simple mode, specifically for Heather").
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

    expect(screen.getByRole('heading', { name: "Nice to meet you, Heather. What's your goal?" })).toBeInTheDocument();
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
    expect(onFinish).toHaveBeenCalledWith({ preferred_name: null, goal: null });
  });

  it('Back keeps what was typed', () => {
    render(<FirstRun mealType="dinner" />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Heather' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Your name')).toHaveValue('Heather');
  });
});
