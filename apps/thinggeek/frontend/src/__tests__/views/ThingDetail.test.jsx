import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within, waitFor } from '@testing-library/react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import ThingDetail, { ThingDetailBody } from '../../views/detail/ThingDetail';
import { ACTION_BAR_PX } from '../../views/detail/ActionBar';
import ReadinessPanel from '../../views/detail/ReadinessPanel';
import TopBar from '../../components/TopBar';
import { mockViewport, renderWithProviders } from '../testUtils';
import { GET_THING } from '../../graphql/queries';
import { DELETE_THING, RESTORE_THING } from '../../graphql/mutations';
import { crumbs, date, makeRifle, makeThing, typeRef } from '../fixtures';

const body = (thing, props = {}) => <ThingDetailBody thing={thing} onPanel={() => {}} onFix={() => {}} uploads={[]} onRetry={() => {}} {...props} />;

vi.mock('@geeksuite/user', () => ({
  useThemeMode: () => ({ theme: 'light', toggleTheme: () => {} }),
}));

const TopBarUnderTest = () => <TopBar user={{ username: 'chef' }} onSignOut={() => {}} />;

const hullRow = () => screen.getByTestId('field-hullNumber');

describe('identifier masking', () => {
  it('shows only the last four, never the whole serial, until revealed', () => {
    renderWithProviders(body(makeThing()));
    const value = within(hullRow()).getByTestId('identifier-value');
    expect(value).toHaveTextContent('••••4567');
    expect(value).toHaveAttribute('data-masked', 'true');
    expect(screen.queryByText('ABC1234567')).toBeNull();
    expect(document.body.textContent).not.toContain('ABC1234567');
    // a non-identifier field is plain
    expect(within(screen.getByTestId('field-manufacturer')).getByText('Tracker')).toBeInTheDocument();
    expect(within(screen.getByTestId('field-lengthFt')).getByText('18 ft')).toBeInTheDocument();
  });

  it('Reveal shows it, pressing again hides it', () => {
    renderWithProviders(body(makeThing()));
    const reveal = screen.getByRole('button', { name: 'Reveal Hull number' });
    expect(reveal).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(reveal);
    expect(within(hullRow()).getByTestId('identifier-value')).toHaveTextContent('ABC1234567');
    const hide = screen.getByRole('button', { name: 'Hide Hull number' });
    expect(hide).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(hide);
    expect(within(hullRow()).getByTestId('identifier-value')).toHaveTextContent('••••4567');
  });

  it('re-masks after moving to another thing and back', () => {
    const wendy = makeThing();
    const { rerender } = renderWithProviders(body(wendy));
    fireEvent.click(screen.getByRole('button', { name: 'Reveal Hull number' }));
    expect(screen.getByText('ABC1234567')).toBeInTheDocument();
    rerender(body(makeRifle()));
    expect(within(screen.getByTestId('field-serial')).getByTestId('identifier-value')).toHaveTextContent('••••6543');
    rerender(body(wendy));
    expect(within(hullRow()).getByTestId('identifier-value')).toHaveTextContent('••••4567');
    expect(screen.queryByText('ABC1234567')).toBeNull();
  });

  it('Copy copies the real value without revealing it', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderWithProviders(body(makeThing()));
    fireEvent.click(screen.getByRole('button', { name: 'Copy Hull number' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ABC1234567'));
    expect(within(hullRow()).getByTestId('identifier-value')).toHaveAttribute('data-masked', 'true');
    expect(await screen.findByText('Hull number copied.')).toBeInTheDocument();
    writeText.mockRestore();
  });
});

describe('accessories read as sentences from both ends', () => {
  it('the boat: "Accessories"', () => {
    renderWithProviders(body(makeThing()));
    const group = screen.getByTestId('relationship-group');
    expect(within(group).getByText('Accessories:')).toBeInTheDocument();
    expect(within(group).getByRole('link', { name: 'Garmin Striker 4' })).toHaveAttribute('href', '/thing/t-garmin');
  });

  it('the fish finder: "Accessory for"', () => {
    const finder = makeThing({
      id: 't-garmin',
      name: 'Garmin Striker 4',
      type: typeRef('ty-general'),
      kind: 'item',
      fields: [],
      relationships: [
        { __typename: 'ThingRelationship', id: 'r1', kind: 'accessory-of', direction: 'out', thing: { __typename: 'ThingSummary', id: 't-wendy', name: 'Wendy', coverThumbUrl: null, type: { __typename: 'ThingType', id: 'ty-boat', name: 'Boat', icon: 'DirectionsBoat' } } },
      ],
    });
    renderWithProviders(body(finder));
    const group = screen.getByTestId('relationship-group');
    expect(within(group).getByText('Accessory for:')).toBeInTheDocument();
    expect(within(group).getByRole('link', { name: 'Wendy' })).toBeInTheDocument();
    expect(screen.queryByText('Accessories:')).toBeNull();
  });
});

describe('where it is', () => {
  const cables = () =>
    makeThing({ id: 't-cables', name: 'Jumper cables', type: typeRef('ty-tool'), kind: 'item', parentId: 'n-van', path: crumbs('n-house', 'n-garage', 'n-van'), fields: [], relationships: [] });

  it('a breadcrumb, root → parent, each crumb a link to that thing, with Move to…', () => {
    const onPanel = vi.fn();
    renderWithProviders(body(cables(), { onPanel }));
    const crumbsNav = screen.getByRole('navigation', { name: 'Where it is' });
    expect(within(crumbsNav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['House', '/thing/n-house'],
      ['Garage', '/thing/n-garage'],
      ['Van', '/thing/n-van'],
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    expect(onPanel).toHaveBeenCalledWith('move');
  });

  it('inside something in the Trash: that crumb is not a link, and the page says so', () => {
    const path = crumbs('n-house', 'n-garage', 'n-van');
    path[2] = { ...path[2], inTrash: true };
    renderWithProviders(body({ ...cables(), path }));
    const crumbsNav = screen.getByRole('navigation', { name: 'Where it is' });
    expect(within(crumbsNav).getAllByRole('link').map((a) => a.textContent)).toEqual(['House', 'Garage']);
    expect(within(crumbsNav).getByText('Van')).toBeInTheDocument();
    expect(within(crumbsNav).getByText('(in the Trash)')).toBeInTheDocument();
    expect(screen.getByTestId('inside-trash')).toHaveTextContent('inside something in the Trash');
  });

  it('a container lists what it contains, each a link, with Add here', () => {
    const van = makeThing({
      id: 'n-van', name: 'Van', type: typeRef('ty-vehicle'), kind: 'container', fields: [], relationships: [], contentsCount: 1,
      contents: [makeThing({ id: 't-cables', name: 'Jumper cables', type: typeRef('ty-tool'), kind: 'item' })],
    });
    renderWithProviders(body(van));
    const section = screen.getByRole('region', { name: 'Inside Van · 1' });
    expect(within(section).getByRole('link', { name: /Jumper cables/ })).toHaveAttribute('href', '/thing/t-cables');
    expect(within(section).getByRole('button', { name: 'Add here' })).toBeInTheDocument();
  });

  it('an empty item has no Contains section; a location always does', () => {
    renderWithProviders(body(cables()));
    expect(screen.queryByTestId('add-here')).toBeNull();
  });

  it('a location says it is empty', () => {
    renderWithProviders(body(makeThing({ id: 'n-shelf', name: 'Shelf 2', type: typeRef('ty-location'), kind: 'location', fields: [], relationships: [] })));
    expect(screen.getByRole('region', { name: /^Inside / })).toHaveTextContent('Nothing inside yet.');
  });
});

describe('dates timeline', () => {
  it('shows status and the next occurrence of a recurring date', () => {
    const thing = makeThing({
      dates: [
        date({ id: 'd-over', kind: 'insurance', daysUntil: -3, status: 'overdue', date: '2026-09-22T00:00:00.000Z', occursOn: '2026-09-22T00:00:00.000Z' }),
        date({ id: 'd-rec', kind: 'registration', label: 'Boat registration', recurEveryMonths: 12, date: '2020-03-03T00:00:00.000Z', occursOn: '2027-03-03T00:00:00.000Z', daysUntil: 159, status: 'later' }),
      ],
    });
    renderWithProviders(body(thing));
    const rows = screen.getAllByTestId('date-row');
    const overdue = rows.find((r) => r.getAttribute('data-status') === 'overdue');
    expect(overdue).toHaveTextContent('Insurance');
    expect(overdue).toHaveTextContent('3 days overdue');
    const recurring = rows.find((r) => r.getAttribute('data-status') === 'later');
    expect(recurring).toHaveTextContent('Boat registration');
    expect(recurring).toHaveTextContent('Mar 3, 2027'); // occursOn, the due date
    expect(recurring).toHaveTextContent('Every year, counting from Mar 3, 2020');
    // overdue sorts first
    expect(rows[0]).toBe(overdue);
  });
});

describe('the ⋯ More sheet, mounted for real', () => {
  function LocationProbe() {
    const location = useLocation();
    return <p>At {location.pathname}{location.search}</p>;
  }

  it('Print label navigates to /labels?ids=<id>', async () => {
    const thing = makeThing({ id: 'th1', name: 'Wendy', contentsCount: 0, contents: [] });
    const mocks = [{ request: { query: GET_THING, variables: { id: 'th1' } }, result: { data: { thing } } }];
    renderWithProviders(
      <Routes>
        <Route path="/thing/:id" element={<ThingDetail />} />
        <Route path="/labels" element={<LocationProbe />} />
      </Routes>,
      { initialEntries: ['/thing/th1'], mocks }
    );
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByText('Print label', { exact: true }));
    expect(await screen.findByText('At /labels?ids=th1')).toBeInTheDocument();
  });
});

describe('Move to Trash: reversible, so it acts at once and offers Undo', () => {
  function LocationProbe() {
    const location = useLocation();
    return (
      <>
        <p>At {location.pathname}</p>
        <Link to="/add">Add a thing</Link>
      </>
    );
  }

  const trashSetup = ({ trashResult, restoreResult } = {}) => {
    const thing = makeThing({ id: 'th1', name: 'Wendy', contentsCount: 2, contents: [] });
    const trashed = vi.fn(() => trashResult ?? { data: { deleteThing: { __typename: 'DeleteResponse', success: true, message: null } } });
    const restored = vi.fn(() => restoreResult ?? { data: { restoreThing: thing } });
    const mocks = [
      { request: { query: GET_THING, variables: { id: 'th1' } }, result: { data: { thing } }, maxUsageCount: 10 },
      { request: { query: DELETE_THING, variables: { id: 'th1' } }, result: trashed },
      { request: { query: RESTORE_THING, variables: { id: 'th1' } }, result: restored },
    ];
    renderWithProviders(
      <Routes>
        <Route path="/thing/:id" element={<ThingDetail />} />
        <Route path="/" element={<LocationProbe />} />
        <Route path="/add" element={<LocationProbe />} />
      </Routes>,
      { initialEntries: ['/thing/th1'], mocks }
    );
    return { trashed, restored };
  };
  const trashIt = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByText('Move to Trash', { exact: true }));
  };

  it('no confirmation; the toast says so and Undo restores it and comes back to it', async () => {
    const thing = makeThing({ id: 'th1', name: 'Wendy', contentsCount: 2, contents: [] });
    const trashed = vi.fn(() => ({ data: { deleteThing: { __typename: 'DeleteResponse', success: true, message: null } } }));
    const restored = vi.fn(() => ({ data: { restoreThing: thing } }));
    const mocks = [
      { request: { query: GET_THING, variables: { id: 'th1' } }, result: { data: { thing } }, maxUsageCount: 10 },
      { request: { query: DELETE_THING, variables: { id: 'th1' } }, result: trashed },
      { request: { query: RESTORE_THING, variables: { id: 'th1' } }, result: restored },
    ];
    renderWithProviders(
      <Routes>
        <Route path="/thing/:id" element={<ThingDetail />} />
        <Route path="/" element={<LocationProbe />} />
      </Routes>,
      { initialEntries: ['/thing/th1'], mocks }
    );
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByText('Move to Trash', { exact: true }));
    await waitFor(() => expect(trashed).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: /Move to Trash\?/ })).toBeNull();
    expect(await screen.findByText('At /')).toBeInTheDocument();
    expect(screen.getByText(/Wendy is in the Trash for \d+ days\. The 2 things inside stay put\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(restored).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Wendy is back.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Wendy' })).toBeInTheDocument();
  }, 30000);

  it('gone on somewhere else before Undo: it comes back, and the reader stays put with an Open', async () => {
    const { restored } = trashSetup();
    await trashIt();
    expect(await screen.findByText('At /')).toBeInTheDocument();
    // The reader moves on (say, to Add) while the toast is still up.
    fireEvent.click(screen.getByRole('link', { name: 'Add a thing' }));
    expect(await screen.findByText('At /add')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(restored).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Wendy is back.')).toBeInTheDocument();
    expect(screen.getByText('At /add')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Wendy' })).toBeInTheDocument();
  }, 30000);
});

describe('claim readiness', () => {
  it('a keyboard has no ID plate or serial to miss', () => {
    const kb = makeThing({ type: typeRef('ty-keyboard'), fields: [{ __typename: 'ThingAttribute', key: 'switches', label: 'Switches', kind: 'text', unit: null, identifier: false, value: 'Brown' }], missing: ['photo', 'value'] });
    const onFix = vi.fn();
    renderWithProviders(<ReadinessPanel thing={kb} onFix={onFix} />);
    const panel = screen.getByTestId('readiness');
    expect(panel).toHaveTextContent('1 of 3 on file');
    expect(screen.queryByTestId('fix-id-plate')).toBeNull();
    expect(screen.queryByTestId('fix-serial')).toBeNull();
    fireEvent.click(screen.getByTestId('fix-photo'));
    expect(onFix).toHaveBeenCalledWith('photo');
  });

  it('a boat missing its ID plate and serial offers both fixes', () => {
    const onFix = vi.fn();
    renderWithProviders(<ReadinessPanel thing={makeThing({ missing: ['id-plate', 'serial'] })} onFix={onFix} />);
    expect(screen.getByTestId('readiness')).toHaveTextContent('3 of 5 on file');
    fireEvent.click(screen.getByRole('button', { name: /Add an ID-plate photo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Record the serial/ }));
    expect(onFix.mock.calls).toEqual([['id-plate'], ['serial']]);
  });

  it('says so when everything is on file', () => {
    renderWithProviders(<ReadinessPanel thing={makeThing({ missing: [] })} onFix={() => {}} />);
    expect(screen.getByText('Everything an insurer asks for is on file.')).toBeInTheDocument();
  });

  it('the detail action bar and fix buttons route through onPanel/onFix', () => {
    const onPanel = vi.fn();
    const onFix = vi.fn();
    renderWithProviders(body(makeThing(), { onPanel, onFix }));
    fireEvent.click(within(screen.getByTestId('detail-actions')).getByRole('button', { name: 'Add photo' }));
    fireEvent.click(screen.getByTestId('fix-receipt'));
    expect(onPanel).toHaveBeenCalledWith('photo');
    expect(onFix).toHaveBeenCalledWith('receipt');
  });
});

/** jsdom skips @media rules, so read MUI's xs breakpoint rule (min-width:0px) for an element's emotion class straight from the sheet. */
function phoneRule(el, prop) {
  const css = [...document.querySelectorAll('style')].map((st) => st.textContent).join('\n');
  const classes = [...el.classList].filter((c) => c.startsWith('css-'));
  for (const cls of classes) {
    const m = new RegExp(`@media \\(min-width:0px\\)\\{\\.${cls}\\{([^}]*)\\}`).exec(css);
    const v = m && new RegExp(`(?:^|;)${prop}:([^;]+)`).exec(m[1]);
    if (v) return v[1];
  }
  return null;
}

describe('on a phone, the action bar pins and the top bar names the thing', () => {
  it('every box between the action bar and the article is display:contents, so sticky has the whole page to ride', () => {
    renderWithProviders(body(makeThing()));
    const article = screen.getByTestId('thing-page');
    let node = screen.getByTestId('detail-actions').parentElement;
    const between = [];
    while (node && node !== article) {
      between.push(node);
      node = node.parentElement;
    }
    expect(node).toBe(article);
    expect(between.length).toBeGreaterThan(0);
    between.forEach((el) => expect(phoneRule(el, 'display')).toBe('contents'));
    expect(phoneRule(screen.getByTestId('detail-actions'), 'position')).toMatch(/sticky/);
  });

  it('once the name has scrolled away, the top bar reads the name instead of "Thing"', () => {
    const observers = [];
    const Original = window.IntersectionObserver;
    window.IntersectionObserver = class {
      constructor(cb) {
        this.cb = cb;
        observers.push(this);
      }
      observe(el) {
        this.el = el;
      }
      disconnect() {}
      unobserve() {}
    };
    try {
      const thing = makeThing({ name: 'Wendy' });
      const { unmount } = renderWithProviders(
        <>
          <TopBarUnderTest />
          {body(thing)}
        </>,
        { initialEntries: ['/thing/t-wendy'] }
      );
      const title = () => document.querySelector('[data-geek-topbar="title"]');
      expect(title()).toHaveTextContent('Thing');
      const io = observers.find((o) => o.el?.id === 'thing-name');
      expect(io).toBeTruthy();
      act(() => io.cb([{ isIntersecting: false, boundingClientRect: { bottom: -10 }, rootBounds: { top: 65 } }]));
      expect(title()).toHaveTextContent('Wendy');
      act(() => io.cb([{ isIntersecting: true, boundingClientRect: { bottom: 300 }, rootBounds: { top: 65 } }]));
      expect(title()).toHaveTextContent('Thing');
      // Below the fold is not "scrolled past".
      act(() => io.cb([{ isIntersecting: false, boundingClientRect: { bottom: 2000 }, rootBounds: { top: 65 } }]));
      expect(title()).toHaveTextContent('Thing');
      unmount();
    } finally {
      window.IntersectionObserver = Original;
    }
  });
});

describe('the top bar title swap: the pinned bar only counts on a phone', () => {
  const marginFor = (width) => {
    const seen = [];
    const Original = window.IntersectionObserver;
    window.IntersectionObserver = class {
      constructor(cb, options) {
        seen.push(options);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    };
    const restore = width ? mockViewport(width) : () => {};
    try {
      const { unmount } = renderWithProviders(body(makeThing({ name: 'Wendy' })), { initialEntries: ['/thing/t-wendy'] });
      unmount();
    } finally {
      restore();
      window.IntersectionObserver = Original;
    }
    return seen.at(-1)?.rootMargin;
  };

  it('a phone allows for the pinned action bar; a desktop, where the bar does not pin, does not', () => {
    expect(marginFor(390)).toBe(`-${ACTION_BAR_PX}px 0px 0px 0px`);
    expect(marginFor(1280)).toBe('-0px 0px 0px 0px');
  });
});

describe('section order', () => {
  const order = () => {
    const heads = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    const at = (re) => heads.findIndex((t) => re.test(t));
    return { readiness: screen.getByTestId('readiness'), at, heads };
  };
  const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('on a phone, claim readiness, value and documents come straight after the action bar, before details and notes', () => {
    const restore = mockViewport(390);
    try {
      renderWithProviders(body(makeThing()));
      const { readiness, at } = order();
      const notes = screen.getByRole('heading', { level: 2, name: 'Notes' });
      const details = screen.getByTestId('field-manufacturer');
      expect(before(screen.getByTestId('detail-actions'), readiness)).toBe(true);
      expect(before(readiness, details)).toBe(true);
      expect(before(readiness, notes)).toBe(true);
      expect(at(/^Value/)).toBeLessThan(at(/^Notes/));
      expect(at(/^Documents/)).toBeLessThan(at(/^Notes/));
      expect(before(screen.getByRole('heading', { level: 2, name: /^Documents/ }), details)).toBe(true);
    } finally {
      restore();
    }
  });

  it('on a desktop, the two columns keep their order: details first, readiness heading the right column', () => {
    renderWithProviders(body(makeThing()));
    const details = screen.getByTestId('field-manufacturer');
    expect(before(details, screen.getByTestId('readiness'))).toBe(true);
  });
});
