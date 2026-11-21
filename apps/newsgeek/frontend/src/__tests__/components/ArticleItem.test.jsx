/**
 * A story card (UX review 2026-11-18):
 *  - finding 2: the whole story opens it. The headline link is a full-width
 *    block at least 44px tall (the harness measures the element, not a
 *    stretched ::after), and its ::after carries it over the excerpt; the ⋯
 *    menu, the time and "Also in" sit above that layer;
 *  - finding 3: the chips ride on the publisher line, the excerpt is two
 *    lines on a phone, and a chip that repeats the section is not printed;
 *  - finding 11: an opened headline turns to the faint ink.
 */
import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import ArticleItem from '../../components/ArticleItem';
import { GAZETTE } from '../../theme/theme';
import { article } from '../fixtures';
import { renderWithProviders } from '../testUtils';

/** Every CSS rule emotion injected whose selector mentions `cls` and `suffix`. */
function rulesFor(el, suffix) {
  const classes = [...el.classList].filter((c) => c.startsWith('css-'));
  const out = [];
  const walk = (rules, media) => {
    for (const rule of rules) {
      if (rule.cssRules && !rule.selectorText) walk(rule.cssRules, rule.media?.mediaText ?? rule.conditionText ?? media);
      else if (rule.selectorText && classes.some((c) => rule.selectorText.includes(`.${c}${suffix}`))) out.push(Object.assign(rule, { inMedia: media }));
    }
  };
  for (const sheet of document.styleSheets) walk(sheet.cssRules, null);
  return out;
}

const hex = (c) => c.toLowerCase();
const rgbToHex = (rgb) => `#${rgb.match(/\d+/g).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;

describe('the whole story is one tap (finding 2)', () => {
  it('the headline link is a full-width block, 44px at least, stretched over the story by its ::after', () => {
    renderWithProviders(<ArticleItem article={article('a1', { title: 'Short one', alsoIn: [{ __typename: 'NewsAlsoIn', publisher: 'KARK', url: 'https://kark.com/x', sourceId: 's9' }] })} />);
    const link = screen.getByTestId('story-link');
    const cs = getComputedStyle(link);
    expect(cs.display).toBe('block');
    // 44px wherever the pointer is a finger (the harness's coarse contexts).
    const coarse = rulesFor(link, '').find((r) => r.inMedia?.includes('pointer: coarse'));
    expect(coarse?.style.minHeight).toBe('44px');
    const after = rulesFor(link, '::after');
    expect(after.length).toBeGreaterThan(0);
    expect(after[0].style.position).toBe('absolute');
    expect(after[0].style.inset).toBe('0');
    // The story is what it stretches over: the article is the positioned box.
    expect(getComputedStyle(screen.getByTestId('article')).position).toBe('relative');
    // Heading semantics and the hidden "opens at…" stay.
    expect(screen.getByRole('heading', { name: /Short one/ })).toContainElement(link);
    expect(link).toHaveAccessibleName('Short one (opens at The Arkadelphian, in a new tab)');
  });

  it('the ⋯ menu and "Also in" stay their own targets, above the stretched link', () => {
    renderWithProviders(<ArticleItem article={article('a1', { alsoIn: [{ __typename: 'NewsAlsoIn', publisher: 'KARK', url: 'https://kark.com/x', sourceId: 's9' }] })} />);
    const menu = screen.getByTestId('article-menu-button').parentElement;
    expect(getComputedStyle(menu).position).toBe('relative');
    expect(getComputedStyle(menu).zIndex).toBe('1');
    const also = screen.getByTestId('also-in');
    expect(getComputedStyle(also).position).toBe('relative');
    expect(getComputedStyle(also).zIndex).toBe('1');
  });
});

describe('the card’s own controls never open the story too (finding 2)', () => {
  // jsdom does no hit-testing, so the z-index layering is checked above by its
  // CSS and on a device; what can be proved here is that the ⋯ and Also-in are
  // not inside the story link, so a tap on them is never also a tap on it.
  it('the ⋯ menu and an Also-in link sit outside the headline link, and tapping them does not click it', () => {
    renderWithProviders(<ArticleItem article={article('a1', { alsoIn: [{ __typename: 'NewsAlsoIn', publisher: 'KARK', url: 'https://kark.com/x', sourceId: 's9' }] })} />);
    const link = screen.getByTestId('story-link');
    const opened = vi.fn((e) => e.preventDefault());
    link.addEventListener('click', opened);
    const menu = screen.getByTestId('article-menu-button');
    const alsoBox = screen.getByTestId('also-in');
    const toggle = within(alsoBox).getByRole('button');
    expect(link.contains(menu)).toBe(false);
    expect(link.contains(alsoBox)).toBe(false);
    fireEvent.click(toggle);
    const also = within(alsoBox).getByRole('link', { name: /KARK/ });
    also.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(also);
    // Last: the open menu is modal and hides the rest from the accessibility tree.
    fireEvent.click(menu);
    expect(opened).not.toHaveBeenCalled();
    // The headline itself still opens it, once.
    fireEvent.click(link);
    expect(opened).toHaveBeenCalledTimes(1);
  });
});

describe('a shorter card (finding 3)', () => {
  it('the why-chips sit on the publisher line', () => {
    renderWithProviders(<ArticleItem article={article('a1')} why={['Arkadelphia', '★ Favorite']} />);
    const line = screen.getByTestId('publisher-line');
    expect(within(line).getAllByTestId('why-chip').map((c) => c.textContent)).toEqual(['Arkadelphia', '★ Favorite']);
  });

  it('a chip that only repeats the section is left out (display only)', () => {
    renderWithProviders(<ArticleItem article={article('a1')} why={['Arkansas', '★ Favorite']} hideChips={['State', 'Arkansas']} />);
    expect(screen.getAllByTestId('why-chip').map((c) => c.textContent)).toEqual(['★ Favorite']);
  });

  it('place chips on a section page leave out the section’s own place too', () => {
    renderWithProviders(
      <ArticleItem article={article('a1', { places: [{ __typename: 'NewsPlace', id: 'ar', name: 'Arkansas' }, { __typename: 'NewsPlace', id: 'lr', name: 'Little Rock' }] })} hideChips={['Arkansas']} />
    );
    expect(within(screen.getByRole('list', { name: 'Places' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Little Rock']);
  });
});

describe('an opened story changes (finding 11)', () => {
  it.each(['light', 'dark'])('a visited headline is set in the faint ink (%s)', (mode) => {
    renderWithProviders(<ArticleItem article={article('a1')} />, { mode });
    const visited = rulesFor(screen.getByTestId('story-link'), ':visited');
    expect(visited.length).toBeGreaterThan(0);
    expect(hex(rgbToHex(visited[0].style.color))).toBe(hex(GAZETTE[mode].inkFaint));
  });
});
