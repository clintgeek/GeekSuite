/**
 * Review 2026-11-27: the serving sheet and the Fix sheet were small centred
 * windows on a phone. Both are bottom sheets there now (bottomSheet.js):
 * anchored to the bottom edge, full width, square at the bottom.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServingSheet from '../ServingSheet.jsx';
import FixSheet from '../FixSheet.jsx';
import { bottomSheetProps } from '../bottomSheet.js';

const EGG = { id: 'egg', name: 'EGG, LARGE', brand: 'HAPPY HENS', nutrition: { calories_per_serving: 72 }, serving: { size: 50, unit: 'g' } };

describe('bottom sheets on a phone', () => {
  it('the helper anchors to the bottom below sm and centres above it', () => {
    expect(bottomSheetProps.sx['& .MuiDialog-container'].alignItems).toEqual({ xs: 'flex-end', sm: 'center' });
    const paper = bottomSheetProps.PaperProps.sx['&&'];
    expect(paper.width.xs).toBe('100%');
    expect(paper.m.xs).toBe(0);
    expect(paper.borderRadius.xs).toBe('16px 16px 0 0');
  });

  // jsdom has no layout and a 1024px window, so the phone rules are read
  // from the stylesheet: what applies to this paper below `sm`.
  const phoneRules = (element) => {
    const classes = element.className.split(' ').filter((c) => c.startsWith('css-'));
    const found = [];
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules || [])) {
        if (!rule.media || !/min-width:\s*0px/.test(rule.conditionText || rule.media.mediaText)) continue;
        for (const inner of Array.from(rule.cssRules || [])) {
          if (classes.some((c) => inner.selectorText?.includes(c))) found.push(inner.style);
        }
      }
    }
    return found;
  };
  const has = (rules, property, value) => rules.some((style) => style.getPropertyValue(property) === value);

  it('the serving sheet uses it: full width, no margin, at the bottom edge', () => {
    render(<ServingSheet open food={EGG} onClose={vi.fn()} onConfirm={vi.fn()} />);
    const paper = screen.getByRole('dialog');
    const rules = phoneRules(paper);
    expect(has(rules, 'width', '100%')).toBe(true);
    expect(has(rules, 'margin', '0px')).toBe(true);
    expect(has(rules, 'max-width', '100%')).toBe(true);
    // Its container (the Dialog root styles it) sits it on the bottom edge.
    const anchored = Array.from(document.styleSheets).some((sheet) => Array.from(sheet.cssRules || [])
      .some((rule) => rule.media && /min-width:\s*0px/.test(rule.conditionText || rule.media.mediaText) && /MuiDialog-container[^}]*align-items:\s*flex-end/.test(rule.cssText)));
    expect(anchored).toBe(true);
    // And it draws a shouted name in title case.
    expect(screen.getByText('How much Egg, Large?')).toBeInTheDocument();
    expect(screen.getByText('Happy Hens')).toBeInTheDocument();
  });

  it('the Fix sheet uses it', () => {
    render(<FixSheet item={{ logId: 'a', name: 'Soup', calories: 220 }} onClose={vi.fn()} fixes={{ setCalories: vi.fn(), redescribe: vi.fn() }} />);
    const rules = phoneRules(screen.getByRole('dialog'));
    expect(has(rules, 'width', '100%')).toBe(true);
    expect(has(rules, 'margin', '0px')).toBe(true);
  });
});
