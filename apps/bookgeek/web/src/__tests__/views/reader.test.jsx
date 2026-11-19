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
import ReaderModal, { AUTO_HIDE_MS } from "../../views/ReaderModal";
import { useReader } from "../../hooks/useReader";
import {
  chapterForHref,
  flattenToc,
  loadCachedLocations,
  loadReaderPosition,
  saveReaderPosition,
} from "../../utils/readerPosition";
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
  it("Back (popstate) closes the reader and only the reader", () => {
    const before = window.history.state?.__geekBack?.length ?? 0;
    const setReaderOpen = vi.fn();
    renderWithProviders(<ReaderModal {...props({ setReaderOpen })} />);
    // The reader owns one entry on the suite back stack, on top of the book's route.
    expect(window.history.state?.__geekBack?.length).toBe(before + 1);
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });
    expect(setReaderOpen).toHaveBeenCalledWith(false);
  });
});

describe("the reader's chrome", () => {
  it("using the font stepper keeps the chrome up; it hides only after you stop", () => {
    vi.useFakeTimers();
    renderWithProviders(<ReaderModal {...props()} />);
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

  async function openReader(readerId) {
    const epubBook = { id: "b1", files: [{ format: "epub", path: "a.epub" }] };
    const hook = renderHook(() => useReader(epubBook, { readerId }));
    hook.result.current.readerContainerRef.current = document.createElement("div");
    act(() => hook.result.current.setReaderOpen(true));
    await waitFor(() => expect(hook.result.current.locationsReady).toBe(true));
    return hook;
  }

  it("reopens where this reader left off, and each page turn is saved", async () => {
    saveReaderPosition("chef", "b1", CFI);
    const hook = await openReader("chef");
    expect(rendition.display).toHaveBeenCalledWith(CFI);
    expect(hook.result.current.readerToc).toEqual([{ id: "1", label: "One", href: "ch1.xhtml", depth: 0 }]);

    const next = "epubcfi(/6/10!/4/2/1:0)";
    act(() => rendition.emit("relocated", { start: { cfi: next } }));
    expect(loadReaderPosition("chef", "b1")).toBe(next);
  });

  it("another reader on the same device starts at the cover", async () => {
    saveReaderPosition("chef", "b1", CFI);
    await openReader("heather");
    expect(rendition.display).toHaveBeenCalledWith();
  });

  it("generates the locations once and caches them for the next open", async () => {
    await openReader("chef");
    expect(book.locations.generate).toHaveBeenCalledTimes(1);
    expect(loadCachedLocations("b1")).toBe('["epubcfi(/6/2)"]');
    book.locations.generate.mockClear();
    await openReader("chef");
    expect(book.locations.generate).not.toHaveBeenCalled();
    expect(book.locations.load).toHaveBeenCalledWith('["epubcfi(/6/2)"]');
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
