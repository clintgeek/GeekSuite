import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickHarvestSheet from '../../components/QuickHarvestSheet';
import { renderWithProviders, mockMatchMediaMatches } from '../testUtils';

// QuickHarvestSheet mounts the real QuickHarvestEntry, which talks to Apollo
// directly — out of scope for this sheet-wiring test, so it's stubbed.
vi.mock('../../components/QuickHarvestEntry', () => ({
  default: () => <div data-testid="quick-harvest-entry-mock" />,
}));

// The FAB used to be the shell's primary action, which is an egg glyph only
// on the phone. UX review 2026-11-18 (FlockGeek 4): the daily action says
// "Log eggs" in words where the job happens, so the sheet mounts its own
// extended GeekFab (portalled out of the route transition).
describe('QuickHarvestSheet', () => {
  let restoreMatchMedia;

  afterEach(() => {
    restoreMatchMedia?.();
    restoreMatchMedia = undefined;
  });

  it("shows a 'Log eggs' FAB with its words on the phone", () => {
    restoreMatchMedia = mockMatchMediaMatches(true); // mobile
    renderWithProviders(<QuickHarvestSheet />);

    const fab = screen.getByRole('button', { name: 'Log eggs' });
    expect(fab).toHaveAttribute('data-geek-fab', 'extended');
    expect(fab).toHaveTextContent('Log eggs');
  });

  it('honors a custom label', () => {
    restoreMatchMedia = mockMatchMediaMatches(true);
    renderWithProviders(<QuickHarvestSheet label="Add today's eggs" />);

    expect(screen.getByRole('button', { name: "Add today's eggs" })).toBeInTheDocument();
  });

  it('renders nothing at md+ (the inline panel is the entry point there)', () => {
    restoreMatchMedia = mockMatchMediaMatches(false); // desktop
    const { container } = renderWithProviders(<QuickHarvestSheet />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'Log eggs' })).not.toBeInTheDocument();
  });

  it('opens the sheet from the FAB', async () => {
    const user = userEvent.setup();
    restoreMatchMedia = mockMatchMediaMatches(true);
    renderWithProviders(<QuickHarvestSheet />);

    await user.click(screen.getByRole('button', { name: 'Log eggs' }));

    expect(screen.getByTestId('quick-harvest-entry-mock')).toBeInTheDocument();
  });

  it('can be opened by its page (controlled)', () => {
    restoreMatchMedia = mockMatchMediaMatches(true);
    const onOpenChange = vi.fn();
    renderWithProviders(<QuickHarvestSheet open onOpenChange={onOpenChange} />);

    expect(screen.getByTestId('quick-harvest-entry-mock')).toBeInTheDocument();
  });
});
