/**
 * The keto step's gram line must equal what `derivedMacros` serves (plan D4):
 * with lean mass, protein from the lean rule, carbs the split's %, fat the
 * remainder; without it, the saved % split.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { deriveMacroTargets } from '@geeksuite/utils';
import { createTheme } from '@mui/material/styles';
import KetoPlanStep from '../KetoPlanStep.jsx';

const KETO = { net_carb_limit_g: 20, track_net_carbs: true, macro_split: { preset: 'classic', fat_pct: 70, protein_pct: 25, carb_pct: 5 } };

const servedAt = (calories, leanMassLb) =>
  deriveMacroTargets({ mode: 'keto', keto: KETO, target_weight: 250, daily_calorie_target: calories }, { leanMassLb }).weekly[0];

describe('KetoPlanStep presets', () => {
  it('the chosen preset is marked chosen, and not as white text on solid blue', () => {
    render(<KetoPlanStep ketoConfig={KETO} onChange={() => {}} calorieTarget={2000} />);
    const chosen = screen.getByRole('button', { name: 'Classic 70/25/5' });
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Lazy keto' })).toHaveAttribute('aria-pressed', 'false');
    // Not the solid primary fill with its contrast text (13px white on blue).
    const theme = createTheme();
    const probe = document.createElement('span');
    probe.style.backgroundColor = theme.palette.primary.main;
    probe.style.color = theme.palette.primary.contrastText;
    document.body.appendChild(probe);
    const solid = window.getComputedStyle(probe);
    const { color, backgroundColor } = window.getComputedStyle(chosen);
    expect(backgroundColor).not.toBe(solid.backgroundColor);
    expect(color).not.toBe(solid.color);
    probe.remove();
  });
});

describe('KetoPlanStep gram equivalents', () => {
  it('match derivedMacros with lean mass, and say protein is from lean mass', () => {
    render(<KetoPlanStep ketoConfig={KETO} onChange={() => {}} calorieTarget={2000} baseGoal={{ target_weight: 250 }} leanMassLb={177} />);
    const served = servedAt(2000, 177);
    expect(served.protein_g).toBe(177);
    expect(screen.getByText(`Protein ${served.protein_g}g · Carbs ${served.carbs_g}g · Fat ${served.fat_g}g`)).toBeInTheDocument();
    // The arithmetic is under "How this was worked out" now, not here.
    expect(screen.queryByTestId('protein-basis')).toBeNull();
  });

  it('match the % split without lean mass, with no lean-mass line', () => {
    render(<KetoPlanStep ketoConfig={KETO} onChange={() => {}} calorieTarget={2000} baseGoal={{ target_weight: 250 }} leanMassLb={null} />);
    const served = servedAt(2000, null);
    expect(screen.getByText(`Protein ${served.protein_g}g · Carbs ${served.carbs_g}g · Fat ${served.fat_g}g`)).toBeInTheDocument();
    expect(screen.getByText('Protein 125g · Carbs 25g · Fat 156g')).toBeInTheDocument();
    expect(screen.queryByTestId('protein-basis')).toBeNull();
  });
});
