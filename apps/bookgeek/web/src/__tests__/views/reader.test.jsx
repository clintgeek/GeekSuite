/**
 * The in-app reader, review 2026-11-18 #1 and #2: Back closes only the
 * reader; the chrome stays up while you use it; the middle of the page is the
 * book's; position is the book's percentage and chapter; and the place you
 * stopped is remembered on this device, per reader and book.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import ePub from "epubjs";
import { Dialog } from "@mui/material";
import { GeekSheet } from "@geeksuite/ui";
import ReaderModal, { AUTO_HIDE_MS } from "../../views/ReaderModal";
import { useReader } from "../../hooks/useReader";
import {
  chapterForHref,
  flattenToc,
  loadCachedLocations,
  loadReaderPosition,
  MAX_CACHED_LOCATIONS,
  saveCachedLocations,
  readerBookKey,
  saveReaderPosition,
} from "../../utils/readerPosition";
import { saveReaderPrefs } from "../../utils/readerPrefs";
import { renderWithProviders } from "../testUtils";

vi.mock("epubjs", () => ({ default: vi.fn() }));
vi.mock("@geeksuite/user", async (orig) => ({ ...(await orig()), useThemeMode: () => ({ theme: "dark" }) }));

const btn = (name) => screen.getByRole("button", { name, hidden: true });
const CFI = "epubcfi(/6/8!/4/2/1:0)";

/** A rendition that records its listeners, so a test can play epub.js. */
function fakeRendition({ located = true } = {}) {
  const listeners = {};
  return {
    listeners,
    on: vi.fn((name, fn) => {
      (listeners[name] ||= []).push(fn);
    }),
    off: vi.fn(),
    emit(name, payload) {
      (listeners[name] || []).forEach((fn) => fn(payload));
    },
    prev: vi.fn(),
    next: vi.fn(),
    themes: { fontSize: vi.fn() },
    book: { locations: { length: () => (located ? 100 : 0), percentageFromCfi: () => 0.5 } },
  };
}

function props(over = {}) {
  return {
    readerContainerRef: { current: null },
    readerError: null,
    readerRenditionRef: { current: null },
    readerTheme: "dark",
    selectedBook: { id: "b1", title: "Dune", files: [] },
    setReaderError: vi.fn(),
    setReaderOpen: vi.fn(),
    setReaderTheme: vi.fn(),
    ...over,
  };
}

const topChrome = () => document.querySelector('[data-reader-chrome="top"]');

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the reader's Back", () => {
  it("Back (popstate) closes the reader and only the reader: the book sheet under it stays", async () => {
    const sheetClose = vi.fn();
    const setReaderOpen = vi.fn();
    const Page = ({ reading }) => (
      <>
        <GeekSheet open onClose={sheetClose} title="Lock In">
          <p>the book sheet</p>
        </GeekSheet>
        {reading ? <ReaderModal {...props({ setReaderOpen })} /> : null}
      </>
    );
    const view = renderWithProviders(<Page reading={false} />);
    await waitFor(() => expect(window.history.state?.__geekBack?.length ?? 0).toBeGreaterThan(0));
    // The history entry the book sheet owns, before the reader opens.
    const sheetEntry = window.history.state;
    view.rerender(<Page reading />);
    // The reader owns one more entry, on top of the sheet's.
    await waitFor(() => expect(window.history.state.__geekBack.length).toBe(sheetEntry.__geekBack.length + 1));

    // Back lands on the sheet's entry.
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: sheetEntry }));
    });
    expect(setReaderOpen).toHaveBeenCalledWith(false);
    expect(sheetClose).not.toHaveBeenCalled();
  });
});

describe("the reader over the book sheet", () => {
  it("is the top modal, not hidden from screen readers under the sheet (harness 2026-11-18)", async () => {
    const toc = [{ id: "1", label: "One", href: "ch1.xhtml", depth: 0 }];
    renderWithProviders(
      <>
        <Dialog open aria-label="Book">
          <p>the book sheet</p>
        </Dialog>
        <ReaderModal {...props({ readerToc: toc })} />
      </>
    );
    // No `hidden: true`: the reader's controls must be in the accessibility tree.
    expect(await screen.findByRole("button", { name: "Contents" })).toBeInTheDocument();
  });
});

describe("the reader's chrome", () => {
  it("using the font stepper keeps the chrome up; it hides only after you stop", () => {
    vi.useFakeTimers();
    const rendition = fakeRendition();
    renderWithProviders(<ReaderModal {...props({ readerRenditionRef: { current: rendition } })} />);
    act(() => rendition.emit("rendered"));
    expect(topChrome()).toHaveStyle({ opacity: "1" });
    act(() => vi.advanceTimersByTime(AUTO_HIDE_MS - 500));
    fireEvent.click(btn("Increase font size"));
    act(() => vi.advanceTimersByTime(AUTO_HIDE_MS - 500));
    fireEvent.click(btn("Increase font size"));
    act(() => vi.advanceTimersByTime(AUTO_HIDE_MS - 500));
    expect(topChrome()).toHaveStyle({ opacity: "1" });
    act(() => vi.advanceTimersByTime(600));
    expect(topChrome()).toHaveStyle({ opacity: "0" });
  });

  it("the middle of the page is the book's: no tap zone over it, a plain tap toggles the chrome, a link tap does not", () => {
    const rendition = fakeRendition();
    renderWithProviders(<ReaderModal {...props({ readerRenditionRef: { current: rendition } })} />);
    expect(screen.queryByRole("button", { name: "Toggle controls", hidden: true })).toBeNull();
    // The page-turn strips are the outer quarters only.
    expect(btn("Previous page")).toHaveStyle({ width: "25%" });
    expect(btn("Next page")).toHaveStyle({ width: "25%" });

    const link = document.createElement("a");
    link.href = "#note-1";
    act(() => rendition.emit("click", { target: link }));
    expect(topChrome()).toHaveStyle({ opacity: "1" });

    act(() => rendition.emit("click", { target: document.createElement("p") }));
    expect(topChrome()).toHaveStyle({ opacity: "0" });
  });

  it("a book that failed to open keeps its Close and its error on screen, and says so (review 2026-11-19 #1, #9)", () => {
    vi.useFakeTimers();
    renderWithProviders(<ReaderModal {...props({ readerError: "Could not open this EPUB." })} />);
    act(() => vi.advanceTimersByTime(AUTO_HIDE_MS * 4));
    expect(topChrome()).toHaveStyle({ opacity: "1" });
    expect(btn("Close")).toBeInTheDocument();
    expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent("Could not open this EPUB.");
  });

  it("an error arriving after the first page brings the chrome back", () => {
    vi.useFakeTimers();
    const rendition = fakeRendition();
    const view = renderWithProviders(<ReaderModal {...props({ readerRenditionRef: { current: rendition } })} />);
    act(() => rendition.emit("rendered"));
    act(() => vi.advanceTimersByTime(AUTO_HIDE_MS + 100));
    expect(topChrome()).toHaveStyle({ opacity: "0" });
    view.rerender(<ReaderModal {...props({ readerRenditionRef: { current: rendition }, readerError: "Lost the book." })} />);
    act(() => vi.advanceTimersByTime(AUTO_HIDE_MS * 4));
    expect(topChrome()).toHaveStyle({ opacity: "1" });
  });

  it("before the first page is drawn the chrome stays up, and a turn strip only shows it", () => {
    vi.useFakeTimers();
    const rendition = fakeRendition();
    renderWithProviders(<ReaderModal {...props({ readerRenditionRef: { current: rendition } })} />);
    act(() => vi.advanceTimersByTime(AUTO_HIDE_MS * 4));
    expect(topChrome()).toHaveStyle({ opacity: "1" });
    fireEvent.click(btn("Next page"));
    expect(rendition.next).not.toHaveBeenCalled();
    act(() => rendition.emit("rendered"));
    fireEvent.click(btn("Next page"));
    expect(rendition.next).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(AUTO_HIDE_MS + 100));
    expect(topChrome()).toHaveStyle({ opacity: "0" });
  });

  it("a font size change shows the same page again, by its CFI (review 2026-11-19 #2)", () => {
    const rendition = {
      ...fakeRendition(),
      location: { start: { cfi: CFI } },
      display: vi.fn(() => Promise.resolve()),
      themes: { fontSize: vi.fn() },
    };
    renderWithProviders(<ReaderModal {...props({ readerRenditionRef: { current: rendition } })} />);
    // Opening applies nothing here: useReader set the size before the first page.
    expect(rendition.display).not.toHaveBeenCalled();
    fireEvent.click(btn("Increase font size"));
    expect(rendition.themes.fontSize).toHaveBeenLastCalledWith("110%");
    expect(rendition.display).toHaveBeenCalledWith(CFI);
    expect(rendition.display.mock.invocationCallOrder[0]).toBeGreaterThan(
      rendition.themes.fontSize.mock.invocationCallOrder.at(-1)
    );
  });

  it("a swipe inside the book's page turns it", () => {
    const rendition = fakeRendition();
    renderWithProviders(<ReaderModal {...props({ readerRenditionRef: { current: rendition } })} />);
    act(() => rendition.emit("touchstart", { changedTouches: [{ clientX: 300, clientY: 200 }] }));
    act(() => rendition.emit("touchend", { changedTouches: [{ clientX: 100, clientY: 210 }] }));
    expect(rendition.next).toHaveBeenCalled();
  });
});

describe("where you are in the book", () => {
  const toc = flattenToc([
    { id: "1", href: "Text/ch1.xhtml", label: "One" },
    { id: "2", href: "Text/ch2.xhtml#start", label: "The Desert", subitems: [{ id: "2a", href: "Text/ch2.xhtml#s2", label: "Night" }] },
  ]);

  it("shows the book's percentage and the chapter, and fills the rail", () => {
    const rendition = fakeRendition();
    renderWithProviders(<ReaderModal {...props({ readerRenditionRef: { current: rendition }, readerToc: toc })} />);
    act(() =>
      rendition.emit("relocated", {
        start: { cfi: CFI, href: "OEBPS/Text/ch2.xhtml", percentage: 0.42, displayed: { page: 3, total: 9 } },
      })
    );
    expect(screen.getByTestId("reader-position")).toHaveTextContent("42% · The Desert");
    expect(screen.queryByText(/Page 3 of 9/)).toBeNull();
    expect(screen.getByTestId("reader-progress-fill")).toHaveStyle({ width: "42%" });
  });

  it("before the locations exist it shows the chapter, not a chapter's page count", () => {
    const rendition = fakeRendition({ located: false });
    renderWithProviders(<ReaderModal {...props({ readerRenditionRef: { current: rendition }, readerToc: toc })} />);
    act(() => rendition.emit("relocated", { start: { cfi: CFI, href: "Text/ch1.xhtml", displayed: { page: 3, total: 9 } } }));
    expect(screen.getByTestId("reader-position")).toHaveTextContent(/^One$/);
  });

  it("Contents lists the chapters and jumps to one", async () => {
    const goToHref = vi.fn();
    renderWithProviders(<ReaderModal {...props({ readerToc: toc, goToHref })} />);
    fireEvent.click(btn("Contents"));
    fireEvent.click(await screen.findByRole("button", { name: "Night" }));
    expect(goToHref).toHaveBeenCalledWith("Text/ch2.xhtml#s2");
  });

  it("arrow keys turn the page, but not while you move through Contents (review 2026-11-19 #5)", async () => {
    const rendition = fakeRendition();
    renderWithProviders(<ReaderModal {...props({ readerRenditionRef: { current: rendition }, readerToc: toc })} />);
    fireEvent.keyDown(btn("Close"), { key: "ArrowRight" });
    expect(rendition.next).toHaveBeenCalledTimes(1);

    fireEvent.click(btn("Contents"));
    const entry = await screen.findByRole("button", { name: "Night" });
    fireEvent.keyDown(entry, { key: "ArrowRight" });
    fireEvent.keyDown(entry, { key: "ArrowLeft" });
    expect(rendition.next).toHaveBeenCalledTimes(1);
    expect(rendition.prev).not.toHaveBeenCalled();
  });

  it("two chapters with one name: only the one you are in is marked current (review 2026-11-19 #6)", async () => {
    const parts = flattenToc([
      { id: "p1", href: "p1.xhtml", label: "Part One", subitems: [{ id: "p1c1", href: "p1c1.xhtml", label: "Chapter 1" }] },
      { id: "p2", href: "p2.xhtml", label: "Part Two", subitems: [{ id: "p2c1", href: "p2c1.xhtml", label: "Chapter 1" }] },
    ]);
    const rendition = fakeRendition();
    renderWithProviders(<ReaderModal {...props({ readerRenditionRef: { current: rendition }, readerToc: parts })} />);
    act(() => rendition.emit("relocated", { start: { cfi: CFI, href: "p2c1.xhtml" } }));
    fireEvent.click(btn("Contents"));
    const entries = await screen.findAllByRole("button", { name: "Chapter 1" });
    expect(entries).toHaveLength(2);
    expect(entries[0]).not.toHaveAttribute("aria-current");
    expect(entries[1]).toHaveAttribute("aria-current", "location");
  });

  it("a chapter split over two files is still named on its second file (review 2026-11-19 #7)", () => {
    const split = flattenToc([
      { id: "1", href: "../Text/ch1.xhtml", label: "One" },
      { id: "2", href: "../Text/ch2.xhtml", label: "Two" },
    ]);
    const rendition = fakeRendition();
    rendition.book.spine = {
      spineItems: [
        { href: "Text/ch1.xhtml", index: 0 },
        { href: "Text/ch1b.xhtml", index: 1 },
        { href: "Text/ch2.xhtml", index: 2 },
      ],
    };
    renderWithProviders(<ReaderModal {...props({ readerRenditionRef: { current: rendition }, readerToc: split })} />);
    act(() => rendition.emit("relocated", { start: { cfi: CFI, href: "Text/ch1b.xhtml", index: 1, percentage: 0.1 } }));
    expect(screen.getByTestId("reader-position")).toHaveTextContent("10% · One");
    // A nav file one folder down ("../Text/…") still matches its spine file.
    act(() => rendition.emit("relocated", { start: { cfi: CFI, href: "Text/ch2.xhtml", index: 2, percentage: 0.6 } }));
    expect(screen.getByTestId("reader-position")).toHaveTextContent("60% · Two");
  });

  it("chapterForHref matches by file, whichever side carries the folder", () => {
    expect(chapterForHref(toc, "Text/ch2.xhtml")).toBe("The Desert");
    expect(chapterForHref(toc, "ch1.xhtml")).toBe("One");
    expect(chapterForHref(toc, "ch9.xhtml")).toBeNull();
  });
});

describe("the place you stopped, on this device", () => {
  let rendition;
  let book;

  beforeEach(() => {
    rendition = {
      ...fakeRendition(),
      display: vi.fn(async () => {}),
      destroy: vi.fn(),
      themes: { register: vi.fn(), select: vi.fn(), fontSize: vi.fn() },
    };
    book = {
      on: vi.fn(),
      renderTo: vi.fn(() => rendition),
      loaded: { navigation: Promise.resolve({ toc: [{ id: "1", href: "ch1.xhtml", label: "One" }] }) },
      ready: Promise.resolve(),
      locations: { load: vi.fn(), generate: vi.fn(async () => []), save: () => '["epubcfi(/6/2)"]', length: () => 1 },
      destroy: vi.fn(),
    };
    ePub.mockReturnValue(book);
  });

  const EPUB_BOOK = { id: "b1", files: [{ format: "epub", path: "a.epub", size: 1000, addedAt: "2026-01-01T00:00:00Z" }] };
  const KEY = readerBookKey(EPUB_BOOK);

  async function openReader(readerId, epubBook = EPUB_BOOK) {
    const hook = renderHook(() => useReader(epubBook, { readerId }));
    act(() => hook.result.current.setReaderOpen(true));
    // The Dialog attaches its container after it opens (a portal): the load
    // must wait for it rather than give up.
    act(() => hook.result.current.readerContainerRef(document.createElement("div")));
    await waitFor(() => expect(hook.result.current.locationsReady).toBe(true));
    return hook;
  }

  it("reopens where this reader left off, and each page turn is saved", async () => {
    saveReaderPosition("chef", KEY, CFI);
    const hook = await openReader("chef");
    expect(rendition.display).toHaveBeenCalledWith(CFI);
    expect(hook.result.current.readerToc).toEqual([{ id: "1", label: "One", href: "ch1.xhtml", depth: 0 }]);

    const next = "epubcfi(/6/10!/4/2/1:0)";
    act(() => rendition.emit("relocated", { start: { cfi: next } }));
    expect(loadReaderPosition("chef", KEY)).toBe(next);
  });

  it("the remembered theme and font size are on before the saved page is laid out (review 2026-11-19 #2)", async () => {
    // The drift itself (text reflowing under epub.js's pixel offset) needs a
    // real browser; jsdom can only prove the order of the calls.
    saveReaderPrefs({ fontPct: 130 });
    saveReaderPosition("chef", KEY, CFI);
    await openReader("chef");
    expect(rendition.themes.fontSize).toHaveBeenCalledWith("130%");
    expect(rendition.display).toHaveBeenCalledWith(CFI);
    const displayAt = rendition.display.mock.invocationCallOrder[0];
    expect(rendition.themes.fontSize.mock.invocationCallOrder[0]).toBeLessThan(displayAt);
    expect(rendition.themes.select.mock.invocationCallOrder[0]).toBeLessThan(displayAt);
  });

  it("a new file uploaded to the same book starts fresh: no old CFI, no old locations (review 2026-11-19 #4)", async () => {
    await openReader("chef");
    act(() => rendition.emit("relocated", { start: { cfi: CFI } }));
    rendition.display.mockClear();
    book.locations.generate.mockClear();
    book.locations.load.mockClear();

    const replaced = { id: "b1", files: [{ format: "epub", path: "a.epub", size: 2400, addedAt: "2026-11-19T00:00:00Z" }] };
    expect(readerBookKey(replaced)).not.toBe(KEY);
    await openReader("chef", replaced);
    expect(rendition.display).toHaveBeenCalledWith();
    expect(rendition.display).not.toHaveBeenCalledWith(CFI);
    expect(book.locations.load).not.toHaveBeenCalled();
    expect(book.locations.generate).toHaveBeenCalledTimes(1);
  });

  it("another reader on the same device starts at the cover", async () => {
    saveReaderPosition("chef", KEY, CFI);
    await openReader("heather");
    expect(rendition.display).toHaveBeenCalledWith();
  });

  it("generates the locations once and caches them for the next open", async () => {
    await openReader("chef");
    expect(book.locations.generate).toHaveBeenCalledTimes(1);
    expect(loadCachedLocations(KEY)).toBe('["epubcfi(/6/2)"]');
    book.locations.generate.mockClear();
    await openReader("chef");
    expect(book.locations.generate).not.toHaveBeenCalled();
    expect(book.locations.load).toHaveBeenCalledWith('["epubcfi(/6/2)"]');
  });

  it("the locations cache keeps the books you open, not the ones cached first (review 2026-11-19 #7)", () => {
    for (let i = 0; i < MAX_CACHED_LOCATIONS; i += 1) saveCachedLocations(`k${i}`, `["${i}"]`);
    // Reopening the oldest makes it the newest...
    expect(loadCachedLocations("k0")).toBe('["0"]');
    saveCachedLocations("k-new", '["n"]');
    // ...so the next book in pushes out the least recently opened one instead.
    expect(loadCachedLocations("k0")).toBe('["0"]');
    expect(loadCachedLocations("k1")).toBeNull();
  });

  it("blocked storage still opens the book, at the cover", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    await openReader("chef");
    expect(rendition.display).toHaveBeenCalledWith();
    expect(() => rendition.emit("relocated", { start: { cfi: CFI } })).not.toThrow();
  });
});
