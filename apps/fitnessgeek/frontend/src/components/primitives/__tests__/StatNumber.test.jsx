import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatNumber from '../StatNumber.jsx';

describe('StatNumber', () => {
  it('shows a duration as written — "6h 52m", not "6" (the Sleep tile)', () => {
    render(<StatNumber value="6h 52m" />);
    expect(screen.getByText('6h 52m')).toBeInTheDocument();
  });

  it('still formats numbers and numeric strings', () => {
    const { rerender } = render(<StatNumber value={1484} />);
    expect(screen.getByText('1,484')).toBeInTheDocument();
    rerender(<StatNumber value="1,484" />);
    expect(screen.getByText('1,484')).toBeInTheDocument();
    rerender(<StatNumber value="218.7" decimals={1} />);
    expect(screen.getByText('218.7')).toBeInTheDocument();
  });
});
