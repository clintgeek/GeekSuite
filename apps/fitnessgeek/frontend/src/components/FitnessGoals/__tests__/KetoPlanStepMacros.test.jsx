/**
 * The keto step's gram line must equal what `derivedMacros` serves (plan D4):
 * with lean mass, protein from the lean rule, carbs the split's %, fat the
 * remainder; without it, the saved % split.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { deriveMacroTargets } from '@geeksuite/utils';
import KetoPlanStep from '../KetoPlanStep.jsx';

const KETO = { net_carb_limit_g: 20, track_net_carbs: true, macro_split: { preset: 'classic', fat_pct: 70, protein_pct: 25, carb_pct: 5 } };

const servedAt = (calories, leanMassLb) =>
  deriveMacroTargets({ mode: 'keto', keto: KETO, target_weight: 250, daily_calorie_target: calories }, { leanMassLb }).weekly[0];

describe('KetoPlanStep gram equivalents', () => {
  it('match derivedMacros with lean mass, and say protein is from lean mass', () => {
    render(<KetoPlanStep ketoConfig={KETO} onChange={() => {}} calorieTarget={2000} baseGoal={{ target_weight: 250 }} leanMassLb={177} />);
    const served = servedAt(2000, 177);
    expect(served.protein_g).toBe(177);
    expect(screen.getByText(`Fat ${served.fat_g}g · Protein ${served.protein_g}g · Carbs ${served.carbs_g}g`)).toBeInTheDocument();
    expect(screen.getByTestId('protein-basis').textContent).toMatch(/lean mass/);
  });

  it('match the % split without lean mass, with no lean-mass line', () => {
    render(<KetoPlanStep ketoConfig={KETO} onChange={() => {}} calorieTarget={2000} baseGoal={{ target_weight: 250 }} leanMassLb={null} />);
    const served = servedAt(2000, null);
    expect(screen.getByText(`Fat ${served.fat_g}g · Protein ${served.protein_g}g · Carbs ${served.carbs_g}g`)).toBeInTheDocument();
    expect(screen.getByText('Fat 156g · Protein 125g · Carbs 25g')).toBeInTheDocument();
    expect(screen.queryByTestId('protein-basis')).toBeNull();
  });
});
