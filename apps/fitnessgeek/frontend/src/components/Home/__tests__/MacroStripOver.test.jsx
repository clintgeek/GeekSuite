/**
 * Review D-14: an over-target macro says so in words — "Fat 99 g of 78
 * [21 OVER] 127%" — so no colour carries "over" on its own. The Label draws
 * the macros as "% of daily target" rows, not coloured bars.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createFitnessTheme } from '../../../theme/theme.jsx';
import MacroStrip from '../MacroStrip.jsx';

const renderStrip = (props) => render(
  <ThemeProvider theme={createFitnessTheme('light')}>
    <MacroStrip protein={{ current: 96, goal: 156 }} carbs={{ current: 120, goal: 200 }} fat={{ current: 99, goal: 78 }} {...props} />
  </ThemeProvider>
);

// The row whose bold name is `name` (FactRow: <b>name</b> amount of … percent).
const rowOf = (name) => screen.getByText(name, { selector: 'b' }).closest('div');

describe('MacroStrip over target', () => {
  it('says how far over, in words, with the percent of target', () => {
    renderStrip();
    const fat = rowOf('Fat');
    expect(fat).toHaveTextContent('Fat 99 g of 78');
    expect(fat).toHaveTextContent('21 over');
    expect(fat).toHaveTextContent(/127%$/);
  });

  it('under target says nothing extra', () => {
    renderStrip();
    const protein = rowOf('Protein');
    expect(protein).toHaveTextContent('Protein 96 g of 156');
    expect(protein).not.toHaveTextContent(/over/);
    expect(protein).toHaveTextContent(/62%$/);
  });
});

describe('MacroStrip rows', () => {
  it('heads the column "% of daily target" and leads with Eaten when given calories', () => {
    renderStrip({ calories: { current: 1680, goal: 2340 } });
    expect(screen.getByText('% of daily target')).toBeInTheDocument();
    const names = screen.getAllByText(/^(Eaten|Protein|Carbs|Fat)$/, { selector: 'b' }).map((b) => b.textContent);
    expect(names).toEqual(['Eaten', 'Protein', 'Carbs', 'Fat']);
    expect(rowOf('Eaten')).toHaveTextContent(/Eaten 1,680 cal.*72%$/);
  });

  it('keto: fat, protein, then net carbs against the cap, in words when close', () => {
    renderStrip({ mode: 'keto', netCarbsConsumed: 16, netCarbLimit: 20 });
    const names = screen.getAllByText(/^(Protein|Carbs|Fat|Net carbs)$/, { selector: 'b' }).map((b) => b.textContent);
    expect(names).toEqual(['Fat', 'Protein', 'Net carbs']);
    expect(rowOf('Net carbs')).toHaveTextContent(/Net carbs 16 g of 20.*Close to your limit.*80%$/);
  });
});
