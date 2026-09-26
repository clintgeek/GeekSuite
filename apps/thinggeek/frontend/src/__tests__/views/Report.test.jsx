import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import PrintReport from '../../views/PrintReport';
import { makeRifle, makeThing } from '../fixtures';

describe('the printed insurance report', () => {
  const totals = { __typename: 'ThingInsuranceTotals', count: 2, totalValue: 37000, currency: 'USD', withSerial: 2, withReceipt: 0, withPhoto: 0 };

  it('prints identifiers in full, and says why', () => {
    render(<PrintReport things={[makeThing(), makeRifle()]} totals={totals} scopeText="Everything in the ledger" generatedAt={new Date('2026-09-25T15:00:00Z')} />);
    const ids = screen.getAllByTestId('print-identifier').map((n) => n.textContent);
    expect(ids).toEqual(['ABC1234567', 'XYZ9876543']);
    expect(screen.queryByText(/•/)).toBeNull();
    expect(screen.getByText(/printed in full for the insurer/)).toBeInTheDocument();
    expect(screen.getByText(/Prepared September 25, 2026 · Everything in the ledger/)).toBeInTheDocument();
    expect(screen.getByText('$37,000')).toBeInTheDocument();
  });

  it('one block per thing with make/model, value and acquisition', () => {
    render(<PrintReport things={[makeRifle()]} totals={null} scopeText="Type: Firearm" />);
    const block = screen.getByTestId('print-thing');
    expect(within(block).getByText('Ruger 10/22', { selector: 'div' })).toBeInTheDocument();
    expect(block).toHaveTextContent('Make / model');
    expect(block).toHaveTextContent('Ruger 10/22');
    expect(block).toHaveTextContent('$18,500');
    expect(block).toHaveTextContent('May 1, 2021 · paid $21,000 · from Bass Pro Shops');
    expect(block).toHaveTextContent('receipt —');
  });
});
