/**
 * BookGeek in-browser EPUB reader overlay.
 *
 * Lifted verbatim out of `App.jsx`. The epub.js rendition is still mounted by
 * the effect in `App` — it owns `readerContainerRef` / `readerRenditionRef` —
 * so both refs are threaded in as props and only the markup lives here.
 */
import React from "react";

export default function ReaderModal({
  readerContainerRef,
  readerError,
  readerRenditionRef,
  readerTheme,
  selectedBook,
  setReaderError,
  setReaderOpen,
  setReaderTheme,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-2 py-4">
      <div className="mx-auto flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              In-browser reader
            </div>
            <div className="text-sm font-semibold text-slate-100 line-clamp-1">
              {selectedBook.title || "Untitled"}
            </div>
            {Array.isArray(selectedBook.authors) && selectedBook.authors.length > 0 && (
              <div className="text-[11px] text-slate-400 line-clamp-1">
                {selectedBook.authors.join(", ")}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setReaderTheme((t) => (t === "dark" ? "light" : "dark"));
              }}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
            >
              {readerTheme === "dark" ? "Light" : "Dark"}
            </button>
            <button
              type="button"
              onClick={() => {
                setReaderOpen(false);
                setReaderError(null);
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-sm font-semibold text-slate-300 hover:border-slate-500 hover:text-slate-50"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-900">
          <div
            ref={readerContainerRef}
            className="h-full w-full overflow-hidden bg-slate-900"
          />
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (readerRenditionRef.current?.prev) {
                  readerRenditionRef.current.prev();
                }
              }}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={() => {
                if (readerRenditionRef.current?.next) {
                  readerRenditionRef.current.next();
                }
              }}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500"
            >
              Next →
            </button>
          </div>
          <div className="text-[11px] text-rose-400">
            {readerError || null}
          </div>
        </div>
      </div>
    </div>
  );
}
