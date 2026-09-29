import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import MoreSheet from '../../views/detail/MoreSheet';
import { renderWithProviders } from '../testUtils';

const noop = () => {};

describe('MoreSheet', () => {
  it('Print label sits between Edit everything and Insurance report, and calls onPrintLabel', () => {
    const onPrintLabel = vi.fn();
    renderWithProviders(
      <MoreSheet open onClose={noop} title="Wendy" onEdit={noop} onPrintLabel={onPrintLabel} onReport={noop} onTrash={noop} />
    );
    const labels = screen.getAllByRole('listitem').map((li) => li.textContent);
    const editAt = labels.findIndex((t) => t.includes('Edit everything'));
    const printAt = labels.findIndex((t) => t.includes('Print label'));
    const reportAt = labels.findIndex((t) => t.includes('Insurance report'));
    expect(editAt).toBeGreaterThanOrEqual(0);
    expect(printAt).toBeGreaterThan(editAt);
    expect(reportAt).toBeGreaterThan(printAt);

    fireEvent.click(screen.getByText('Print label', { exact: true }));
    expect(onPrintLabel).toHaveBeenCalledTimes(1);
  });

  it('is left out when no onPrintLabel is given', () => {
    renderWithProviders(<MoreSheet open onClose={noop} title="Wendy" onEdit={noop} onReport={noop} onTrash={noop} />);
    expect(screen.queryByText('Print label', { exact: true })).toBeNull();
  });
});
