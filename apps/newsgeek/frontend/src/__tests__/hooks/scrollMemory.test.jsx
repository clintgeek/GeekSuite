/**
 * Back restores the reader's place (SUITE_REVIEW_2026-11 NewsGeek finding 2):
 * the saved scroll position, applied once the stories are tall enough.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import AppMain from '../../components/AppMain';
import { placeKey, readCount, readScroll, restoreScroll, writeCount, writeScroll } from '../../hooks/scrollMemory';
import { TimeAgoTick } from './timeAgoHarness';

function fakeNode({ height = 0, client = 800 } = {}) {
  const listeners = {};
  return {
    scrollTop: 0,
    clientHeight: client,
    scrollHeight: height,
    addEventListener: (ev, fn) => {
      listeners[ev] = fn;
    },
    removeEventListener: (ev) => {
      delete listeners[ev];
    },
    fire: (ev) => listeners[ev]?.(),
  };
}

describe('scrollMemory storage', () => {
  it('keys by path + query and round-trips scroll and count', () => {
    expect(placeKey({ pathname: '/everything', search: '?section=tech' })).toBe('/everything?section=tech');
    writeScroll('/x', 1234.6);
    writeCount('/x', 60);
    expect(readScroll('/x')).toBe(1235);
    expect(readCount('/x')).toBe(60);
    expect(readScroll('/nothing')).toBe(0);
  });
});

describe('restoreScroll', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits for the list to be tall enough, then scrolls there', () => {
    const node = fakeNode({ height: 900 });
    restoreScroll(node, 2000);
    expect(node.scrollTop).toBe(0);
    node.scrollHeight = 3000;
    vi.advanceTimersByTime(100);
    expect(node.scrollTop).toBe(2000);
  });

  it('the reader touching the page wins', () => {
    const node = fakeNode({ height: 900 });
    restoreScroll(node, 2000);
    node.fire('touchstart');
    node.scrollHeight = 3000;
    vi.advanceTimersByTime(500);
    expect(node.scrollTop).toBe(0);
  });

  it('gives up after the wait and goes as far as it can', () => {
    const node = fakeNode({ height: 1500 });
    restoreScroll(node, 5000, { waitMs: 300 });
    vi.advanceTimersByTime(400);
    expect(node.scrollTop).toBe(700);
  });
});

function Nav() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/story-list-2')}>
        Go
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
    </>
  );
}

/** Pretend the document was loaded this way (Navigation Timing). */
function loadedBy(type) {
  return vi.spyOn(window.performance, 'getEntriesByType').mockImplementation((t) => (t === 'navigation' ? [{ type }] : []));
}

describe('AppMain', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a fresh open or a reload starts at the top, though a place is saved (finding 10)', () => {
    const proto = window.HTMLElement.prototype;
    const sh = Object.getOwnPropertyDescriptor(proto, 'scrollHeight');
    const ch = Object.getOwnPropertyDescriptor(proto, 'clientHeight');
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => 5000 });
    Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => 800 });
    try {
      for (const type of ['navigate', 'reload']) {
        loadedBy(type);
        writeScroll('/', 2400);
        const { container, unmount } = render(
          <MemoryRouter initialEntries={['/']}>
            <AppMain transitionKey="x">
              <p>page</p>
            </AppMain>
          </MemoryRouter>
        );
        expect(container.querySelector('main').scrollTop).toBe(0);
        unmount();
        vi.restoreAllMocks();
      }
    } finally {
      if (sh) Object.defineProperty(proto, 'scrollHeight', sh);
      else delete proto.scrollHeight;
      if (ch) Object.defineProperty(proto, 'clientHeight', ch);
      else delete proto.clientHeight;
    }
  });

  it('Back (POP) returns to the saved place; a new page (PUSH) starts at the top', async () => {
    loadedBy('back_forward');
    // A tall page: jsdom has no layout, so give <main> a size.
    const proto = window.HTMLElement.prototype;
    const sh = Object.getOwnPropertyDescriptor(proto, 'scrollHeight');
    const ch = Object.getOwnPropertyDescriptor(proto, 'clientHeight');
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => 5000 });
    Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => 800 });
    try {
      writeScroll('/everything', 1800);
      const { container } = render(
        <MemoryRouter initialEntries={['/everything']}>
          <AppMain transitionKey="x">
            <Nav />
            <Routes>
              <Route path="*" element={<p>page</p>} />
            </Routes>
          </AppMain>
        </MemoryRouter>
      );
      const main = container.querySelector('main');
      // First load came Back into NewsGeek (Back from a story opened here): the saved place.
      expect(main.scrollTop).toBe(1800);
      act(() => {
        screen.getByRole('button', { name: 'Go' }).click();
      });
      expect(main.scrollTop).toBe(0);
      act(() => {
        screen.getByRole('button', { name: 'Back' }).click();
      });
      expect(main.scrollTop).toBe(1800);
    } finally {
      if (sh) Object.defineProperty(proto, 'scrollHeight', sh);
      else delete proto.scrollHeight;
      if (ch) Object.defineProperty(proto, 'clientHeight', ch);
      else delete proto.clientHeight;
    }
  });
});

describe('TimeAgo on resume', () => {
  it('"12m ago" is re-read when the app comes back', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-10T12:12:00.000Z'));
      render(<TimeAgoTick value="2026-10-10T12:00:00.000Z" />);
      expect(screen.getByText('12m ago')).toBeInTheDocument();
      vi.setSystemTime(new Date('2026-10-10T15:00:00.000Z'));
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(screen.getByText('3h ago')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
