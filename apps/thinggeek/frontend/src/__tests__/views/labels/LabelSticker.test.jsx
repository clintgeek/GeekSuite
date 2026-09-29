import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import LabelSticker, { largeNameFontPt, smallNameFontPt, fitLongestWord, textColumnMm, LABEL_SIZES } from '../../../views/labels/LabelSticker';
import { renderWithProviders } from '../../testUtils';
import { makeThing, makeRifle } from '../../fixtures';

const toStringMock = vi.fn();
vi.mock('qrcode', () => ({
  default: { toString: (...args) => toStringMock(...args) },
}));

beforeEach(() => {
  toStringMock.mockReset();
  toStringMock.mockImplementation((value) => Promise.resolve(`<svg data-value="${value}"></svg>`));
});

describe('largeNameFontPt (Large\'s shrink-to-fit)', () => {
  it('steps down deterministically by character count, never below the floor', () => {
    expect(largeNameFontPt('Van')).toBe(28); // 3 chars
    expect(largeNameFontPt('exactly 12ch')).toBe(28); // 12 chars, the top step's boundary
    expect(largeNameFontPt('12 characters')).toBe(24); // 13 chars, just past that boundary
    expect(largeNameFontPt('Garden tool caddy')).toBe(24); // 17 chars
    expect(largeNameFontPt('Kitchen electronics box')).toBe(20); // 23 chars
    expect(largeNameFontPt('Blue tote — winter gear box')).toBe(17); // 27 chars
    expect(largeNameFontPt('Blue tote — winter camping gear and stove')).toBe(14); // 41 chars, floor
  });

  it('is stable — the same name always gets the same size', () => {
    const name = 'Blue tote — winter camping gear and stove';
    expect(largeNameFontPt(name)).toBe(largeNameFontPt(name));
  });
});

describe('smallNameFontPt (Small\'s shrink-to-fit)', () => {
  it('steps down deterministically by character count, never below the floor', () => {
    expect(smallNameFontPt('Wendy')).toBe(11); // 5 chars
    expect(smallNameFontPt('Tote 1 A')).toBe(11); // 8 chars of short words, the top step's boundary
    expect(smallNameFontPt('Garage shelf')).toBe(9); // 12 chars, in the next step
    expect(smallNameFontPt('exactly 16 chars')).toBe(9); // 16 chars, that step's boundary
    expect(smallNameFontPt('Garden tool caddy')).toBe(7.5); // 17 chars, just past it
    expect(smallNameFontPt('Kitchen gear and tools')).toBe(7.5); // 22 chars, short words
    expect(smallNameFontPt('Blue tote — winter camping gear and stove')).toBe(6.5); // 41 chars, floor
  });
});

describe('whole words fit the text column (no "Wend / y")', () => {
  // Barlow Condensed 700 at ~0.5em per glyph: a word of n chars needs
  // n * 0.5 * pt * (25.4 / 72) mm. Small's text column is 12mm.
  const wordMm = (word, pt) => word.length * 0.5 * pt * (25.4 / 72);

  it('Small shrinks a long single word until it fits, instead of breaking it', () => {
    expect(textColumnMm(LABEL_SIZES.small)).toBe(12);
    const pt = smallNameFontPt('Tackle');
    expect(pt).toBe(11); // 6 chars fit at the top step
    expect(wordMm('Tackle', pt)).toBeLessThanOrEqual(12);
    const long = smallNameFontPt('Toolboxes');
    expect(long).toBeLessThan(11);
    expect(wordMm('Toolboxes', long)).toBeLessThanOrEqual(12);
  });

  it('never goes below the floor, even for an absurd word', () => {
    expect(fitLongestWord('Supercalifragilisticexpialidocious', 11, 12, 6.5)).toBe(6.5);
  });

  it('sizes by the longest word, not the whole name', () => {
    expect(fitLongestWord('a b c d e f g', 11, 12, 6.5)).toBe(11);
    expect(fitLongestWord('Wendy', 11, 12, 6.5)).toBe(11);
  });

  it('Large keeps its step size when the words fit its 46mm column', () => {
    expect(textColumnMm(LABEL_SIZES.large)).toBe(46);
    expect(largeNameFontPt('Van')).toBe(28);
  });
});

describe('LabelSticker — Large (tote front)', () => {
  it('shows the name, the breadcrumb under it, and the ThingGeek footer', async () => {
    renderWithProviders(<LabelSticker thing={makeThing()} size="large" />);
    expect(await screen.findByTestId('label-name')).toHaveTextContent('Wendy');
    expect(screen.getByTestId('label-breadcrumb')).toHaveTextContent('House › Garage');
    expect(screen.getByTestId('label-footer')).toHaveTextContent('ThingGeek');
  });

  it('has no breadcrumb row when the thing has no parents', async () => {
    renderWithProviders(<LabelSticker thing={makeRifle({ path: [] })} size="large" />);
    await screen.findByTestId('label-name');
    expect(screen.queryByTestId('label-breadcrumb')).toBeNull();
  });

  it('the name is the largest text on the label, and dominates more as the name is shorter', async () => {
    renderWithProviders(<LabelSticker thing={makeThing({ name: 'Van' })} size="large" />);
    const sticker = await screen.findByTestId('label-sticker');
    expect(sticker).toHaveAttribute('data-name-pt', '28');
    const name = screen.getByTestId('label-name');
    const breadcrumb = screen.getByTestId('label-breadcrumb');
    const footer = screen.getByTestId('label-footer');
    const pt = (el) => parseFloat(window.getComputedStyle(el).fontSize);
    expect(pt(name)).toBeGreaterThan(pt(breadcrumb));
    expect(pt(breadcrumb)).toBeGreaterThan(pt(footer));
  });

  it('a long name steps down but still wraps up to 2 lines rather than truncating to 1', async () => {
    const longName = 'Blue tote — winter camping gear and stove';
    renderWithProviders(<LabelSticker thing={makeThing({ name: longName })} size="large" />);
    const sticker = await screen.findByTestId('label-sticker');
    expect(sticker).toHaveAttribute('data-name-pt', '14');
    const name = screen.getByTestId('label-name');
    expect(name).toHaveTextContent(longName);
    const computed = window.getComputedStyle(name);
    expect(computed.display).toBe('-webkit-box');
    expect(computed.webkitLineClamp).toBe('2');
    expect(computed.whiteSpace).not.toBe('nowrap');
  });

  it('centres the name+breadcrumb block vertically rather than pinning it to the top', async () => {
    // Regression for the earlier layout: the footer's own `mt: auto` ate all
    // the free space, leaving name+breadcrumb stuck at the top with dead air
    // underneath. Now name+breadcrumb share a `flex: 1, justifyContent:
    // center` wrapper and the footer is a plain, un-margined sibling after
    // it — so the block centres against the (now much taller) QR, and the
    // footer just sits at the natural bottom of the column.
    renderWithProviders(<LabelSticker thing={makeThing({ name: 'Van' })} size="large" />);
    const footer = await screen.findByTestId('label-footer');
    expect(window.getComputedStyle(footer).marginTop).not.toBe('auto');
    const name = screen.getByTestId('label-name');
    // The centring wrapper is the name's parent.
    expect(window.getComputedStyle(name.parentElement).justifyContent).toBe('center');
    expect(window.getComputedStyle(name.parentElement).flex).toContain('1');
  });
});

describe('LabelSticker — Small (label roll)', () => {
  it('never shows a breadcrumb, even when the thing has one — there is no room for it', async () => {
    renderWithProviders(<LabelSticker thing={makeThing()} size="small" />);
    await screen.findByTestId('label-name');
    expect(screen.queryByTestId('label-breadcrumb')).toBeNull();
  });

  it('the QR encodes this thing\'s own URL', async () => {
    renderWithProviders(<LabelSticker thing={makeThing({ id: 't-wendy' })} size="small" />);
    await screen.findByTestId('label-qr-svg');
    expect(toStringMock).toHaveBeenCalledTimes(1);
    expect(toStringMock.mock.calls[0][0]).toMatch(/\/thing\/t-wendy$/);
  });

  it('the name is still the largest text, even without a breadcrumb to compare to', async () => {
    renderWithProviders(<LabelSticker thing={makeThing()} size="small" />);
    const name = await screen.findByTestId('label-name');
    const footer = screen.getByTestId('label-footer');
    const pt = (el) => parseFloat(window.getComputedStyle(el).fontSize);
    expect(pt(name)).toBeGreaterThan(pt(footer));
  });

  it('a long name never truncates to one word — it steps down and wraps up to 3 lines', async () => {
    const longName = 'Blue tote — winter camping gear and stove';
    renderWithProviders(<LabelSticker thing={makeThing({ name: longName })} size="small" />);
    const sticker = await screen.findByTestId('label-sticker');
    expect(sticker).toHaveAttribute('data-name-pt', '6.5');
    const name = screen.getByTestId('label-name');
    // jsdom has no layout engine, so it can't tell us where the browser will
    // actually break lines 2 and 3 — what we CAN assert deterministically is
    // that the full name is in the DOM (nothing here manually slices the
    // string) and that the CSS clamps at 3 lines, not 1: "Blue …" (a single
    // truncated word) is exactly the failure this guards against. The
    // regenerated sample PNG is the visual proof of where it actually wraps.
    expect(name).toHaveTextContent(longName);
    const computed = window.getComputedStyle(name);
    expect(computed.display).toBe('-webkit-box');
    expect(computed.webkitLineClamp).toBe('3');
    expect(computed.whiteSpace).not.toBe('nowrap');
  });

  it('preview mode floors text size instead of printing it true-to-life tiny; print mode never does', async () => {
    renderWithProviders(<LabelSticker thing={makeThing()} size="small" preview />);
    const footer = await screen.findByTestId('label-footer');
    // True Small footer is 3.5pt (~4.7px) — unreadable on a phone screen.
    // Preview mode floors it with CSS max(3.5pt, 13px); jsdom resolves that
    // statically to the 13px winner. Print mode (the default) prints the
    // true, tiny, correct-on-paper size instead — asserted below.
    expect(window.getComputedStyle(footer).fontSize).toBe('calc(13px)');

    renderWithProviders(<LabelSticker thing={makeThing()} size="small" />);
    await screen.findAllByTestId('label-qr-svg');
    const printFooters = screen.getAllByTestId('label-footer');
    expect(window.getComputedStyle(printFooters[printFooters.length - 1]).fontSize).toBe('3.5pt');
  });
});
