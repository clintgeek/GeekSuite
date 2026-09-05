import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import QuickHarvestSheet from '../../components/QuickHarvestSheet';
import { renderWithProviders, mockMatchMediaMatches } from '../testUtils';

const { mockUseGeekPrimaryAction } = vi.hoisted(() => ({
  mockUseGeekPrimaryAction: vi.fn(),
}));

vi.mock('@geeksuite/ui', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useGeekPrimaryAction: mockUseGeekPrimaryAction,
  };
});

// QuickHarvestSheet mounts the real QuickHarvestEntry, which talks to Apollo
// directly — out of scope for this sheet-wiring test, so it's stubbed.
vi.mock('../../components/QuickHarvestEntry', () => ({
  default: () => <div data-testid="quick-harvest-entry-mock" />,
}));

describe('QuickHarvestSheet', () => {
  let restoreMatchMedia;

  beforeEach(() => {
    mockUseGeekPrimaryAction.mockClear();
  });

  afterEach(() => {
    restoreMatchMedia?.();
    restoreMatchMedia = undefined;
  });

  it("registers 'Log eggs' as the primary action", () => {
    restoreMatchMedia = mockMatchMediaMatches(true); // mobile
    renderWithProviders(<QuickHarvestSheet />);

    expect(mockUseGeekPrimaryAction).toHaveBeenCalledTimes(1);
    const [config] = mockUseGeekPrimaryAction.mock.calls[0];
    expect(config.label).toBe('Log eggs');
    expect(typeof config.onClick).toBe('function');
  });

  it('honors a custom label', () => {
    restoreMatchMedia = mockMatchMediaMatches(true);
    renderWithProviders(<QuickHarvestSheet label="Add today's eggs" />);

    const [config] = mockUseGeekPrimaryAction.mock.calls[0];
    expect(config.label).toBe("Add today's eggs");
  });

  it('renders nothing at md+, but still registers (the FAB hides itself there)', () => {
    restoreMatchMedia = mockMatchMediaMatches(false); // desktop
    const { container } = renderWithProviders(<QuickHarvestSheet />);

    expect(mockUseGeekPrimaryAction).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the sheet from the registered action', async () => {
    restoreMatchMedia = mockMatchMediaMatches(true);
    renderWithProviders(<QuickHarvestSheet />);

    const [config] = mockUseGeekPrimaryAction.mock.calls[0];
    await act(async () => {
      config.onClick();
    });

    expect(screen.getByText('Quick harvest')).toBeInTheDocument();
    expect(screen.getByTestId('quick-harvest-entry-mock')).toBeInTheDocument();
  });
});
