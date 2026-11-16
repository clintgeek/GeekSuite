/**
 * S-D3 (SUITE_REVIEW_2026-11, 2026-11-15): reader position sync was decided
 * against, so the login splash must not promise "Sync Progress"; the in-app
 * reader's font size and theme are remembered on this device instead, and a
 * blocked localStorage only ever means the defaults.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, screen, act, fireEvent } from "@testing-library/react";
import ReaderModal from "../../views/ReaderModal";
import { READER_PREFS_KEY, loadReaderPrefs, saveReaderPrefs } from "../../utils/readerPrefs";
import { useReader } from "../../hooks/useReader";
import { renderWithProviders } from "../testUtils";

vi.mock("epubjs", () => ({ default: vi.fn() }));
vi.mock("@geeksuite/user", async (orig) => ({ ...(await orig()), useThemeMode: () => ({ theme: "dark" }) }));

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

// The reader's chrome fades (MUI transition), which jsdom never finishes, so
// its buttons are queried including hidden ones.
const btn = (name) => screen.getByRole("button", { name, hidden: true });

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

describe("the login splash", () => {
  it("does not promise progress sync", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../App.jsx"), "utf8");
    expect(src).not.toMatch(/['"]Sync Progress['"]/);
    expect(src).not.toMatch(/A modern, clean e-reader/);
  });
});

describe("reader preferences", () => {
  it("the font size steps are saved and come back on the next open", async () => {
    const first = renderWithProviders(<ReaderModal {...props()} />);
    fireEvent.click(btn("Increase font size"));
    fireEvent.click(btn("Increase font size"));
    expect(loadReaderPrefs().fontPct).toBe(120);
    first.unmount();

    saveReaderPrefs({ fontPct: 160 });
    renderWithProviders(<ReaderModal {...props()} />);
    // Opened at the remembered maximum: no further step up.
    expect(btn("Increase font size")).toBeDisabled();
  });

  it("the reader theme starts on the remembered one, and a flip is saved", () => {
    saveReaderPrefs({ theme: "light" });
    const { result } = renderHook(() => useReader({ id: "b1", files: [] }));
    expect(result.current.readerTheme).toBe("light");
    act(() => result.current.setReaderTheme("dark"));
    expect(JSON.parse(window.localStorage.getItem(READER_PREFS_KEY)).theme).toBe("dark");
  });

  it("a stored value out of range or garbage is ignored", () => {
    window.localStorage.setItem(READER_PREFS_KEY, JSON.stringify({ fontPct: 9000, theme: "sepia" }));
    expect(loadReaderPrefs()).toEqual({ fontPct: 160 });
    window.localStorage.setItem(READER_PREFS_KEY, "{not json");
    expect(loadReaderPrefs()).toEqual({});
  });

  it("blocked storage means defaults, never a broken reader", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceeded"); });
    renderWithProviders(<ReaderModal {...props()} />);
    fireEvent.click(btn("Increase font size"));
    expect(btn("Decrease font size")).toBeEnabled();
  });
});
