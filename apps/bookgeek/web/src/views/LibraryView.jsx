/**
 * BookGeek library view — the book grid and everything that frames it.
 *
 * Lifted verbatim out of `App.jsx` so each view can be redesigned on its own.
 * All state still lives in `App`; this component is a pure render of the props
 * it is handed, and owns no hooks of its own.
 */
import React from "react";
import { API_BASE, getCoverUrl } from "../utils/bookDisplay";

export default function LibraryView({
  activeView,
  authorFilter,
  basketBookIds,
  basketError,
  basketLoading,
  books,
  clearBasket,
  error,
  handleCreateDeviceBasket,
  handleMergeSelectedBooks,
  handleSaveCurrentFilter,
  hasMore,
  loadMoreRef,
  loading,
  loadingMore,
  mergeLoading,
  mergeSelectionError,
  saveFilterLoading,
  searchQuery,
  selectedBookIds,
  setAuthorFilter,
  setDownloadOpen,
  setSearchQuery,
  setSelectedBook,
  setShelfFilter,
  setSortBy,
  setSortDir,
  setTagFilter,
  shelfFilter,
  shelves,
  showMergeUi,
  sortBy,
  sortDir,
  tagFilter,
  toggleBasket,
  toggleBookSelection,
}) {
  return (
    <main
      className={
        "flex-1 rounded-xl p-3.5 md:p-4 " +
        (activeView === "profile" ? "hidden" : "")
      }
      style={{ backgroundColor: 'var(--color-bg-surface-alt)', border: '1px solid var(--color-border)' }}
    >
      <div className="mb-2 flex flex-col gap-2 md:mb-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] md:text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {loading
              ? "Loading from backend…"
              : error
                ? "Backend error — see status chip above."
                : books.length === 0
                  ? "No books found."
                  : ""}
          </p>
        </div>
      </div>

      {/* Toolbar — two visual zones */}
      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        {/* Left cluster: library controls */}
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs" style={{ border: '1px solid var(--color-border-input)', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}>
            <span style={{ color: 'var(--color-text-faint)' }}>Sort</span>
            <select
              className="bg-transparent text-xs outline-none"
              style={{ color: 'var(--color-text-primary)' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="title">Title</option>
              <option value="author">Author</option>
              <option value="rating">Rating</option>
              <option value="dateAdded">Date added</option>
              <option value="dateFinished">Date finished</option>
              <option value="pageCount">Page count</option>
              <option value="publishedDate">Published date</option>
              <option value="owned">Owned</option>
            </select>
            <button
              type="button"
              onClick={() =>
                setSortDir((prev) => (prev === "desc" ? "asc" : "desc"))
              }
              className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] hover:opacity-80"
              style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-surface-alt)', color: 'var(--color-text-secondary)' }}
              title={sortDir === "asc" ? "Ascending" : "Descending"}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
          <input
            type="text"
            className="flex-1 min-w-[140px] rounded-lg px-2 py-1.5 text-xs outline-none"
            style={{ border: '1px solid var(--color-border-input)', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
            placeholder="Search title / author / tag"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Right cluster: filtering */}
        <div className="flex flex-wrap items-center gap-2">
          {basketBookIds.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleCreateDeviceBasket}
                disabled={basketLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-600 bg-amber-900/50 px-3 py-1.5 text-xs font-medium text-amber-100 hover:border-amber-400 hover:bg-amber-800/70 disabled:opacity-60"
                title="Create a Kindle download basket from selected books"
              >
                <span>📱</span>
                <span>{basketLoading ? "Creating…" : `Download to Device (${basketBookIds.length})`}</span>
              </button>
              <button
                type="button"
                onClick={clearBasket}
                className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-300 hover:border-slate-500 hover:bg-slate-800"
                title="Clear basket selection"
              >
                ×
              </button>
            </div>
          )}
          {basketError && (
            <span className="text-[11px] text-rose-400">{basketError}</span>
          )}
          <button
            type="button"
            onClick={handleSaveCurrentFilter}
            disabled={saveFilterLoading}
            className="inline-flex items-center rounded-lg border border-sky-600 bg-sky-900/40 px-3 py-1.5 text-xs font-medium text-sky-100 hover:border-sky-400 hover:bg-sky-800 disabled:opacity-60"
          >
            {saveFilterLoading ? "Saving…" : "Save filter"}
          </button>
          <input
            type="text"
            className="min-w-[120px] rounded-lg px-2 py-1.5 text-xs outline-none"
            style={{ border: '1px solid var(--color-border-input)', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
            placeholder="Filter by tag / genre"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          />
          <div className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs" style={{ border: '1px solid var(--color-border-input)', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}>
            <span className="text-[10px]" style={{ color: 'var(--color-text-faint)' }}>Shelf</span>
            <select
              value={shelfFilter}
              onChange={(e) => setShelfFilter(e.target.value)}
              className="bg-transparent text-xs outline-none"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {shelves.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          {showMergeUi && (
            <button
              type="button"
              onClick={handleMergeSelectedBooks}
              disabled={
                mergeLoading || selectedBookIds.length !== 2
              }
              className={
                "inline-flex items-center rounded-lg border px-3 py-1.5 text-xs " +
                (selectedBookIds.length === 2 && !mergeLoading
                  ? "border-sky-500 bg-sky-900/40 text-sky-100 hover:border-sky-400 hover:bg-sky-800"
                  : "border-slate-800 bg-slate-900 text-slate-100 opacity-60")
              }
            >
              {mergeLoading
                ? "Merging…"
                : `Merge selected (${ selectedBookIds.length || 0 }/2)`}
            </button>
          )}
        </div>
      </div>

      {(searchQuery.trim() ||
        authorFilter.trim() ||
        tagFilter.trim() ||
        shelfFilter !== "all") && (
          <div className="mb-3 flex flex-wrap gap-1 text-[11px]">
            {shelfFilter !== "all" && (
              <button
                type="button"
                onClick={() => setShelfFilter("all")}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-800"
              >
                <span>
                  Shelf:{" "}
                  {shelves.find((s) => s.id === shelfFilter)?.label ||
                    shelfFilter}
                </span>
                <span className="text-slate-500 dark:text-slate-400">×</span>
              </button>
            )}
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-800"
              >
                <span>Search: {searchQuery.trim()}</span>
                <span className="text-slate-500 dark:text-slate-400">×</span>
              </button>
            )}
            {authorFilter.trim() && (
              <button
                type="button"
                onClick={() => setAuthorFilter("")}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-800"
              >
                <span>Author: {authorFilter.trim()}</span>
                <span className="text-slate-500 dark:text-slate-400">×</span>
              </button>
            )}
            {tagFilter.trim() && (
              <button
                type="button"
                onClick={() => setTagFilter("")}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-800"
              >
                <span>Tag: {tagFilter.trim()}</span>
                <span className="text-slate-500 dark:text-slate-400">×</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setAuthorFilter("");
                setTagFilter("");
                setShelfFilter("all");
              }}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-900"
            >
              <span>Clear all</span>
            </button>
          </div>
        )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col rounded-xl p-2.5 text-xs animate-pulse"
              style={{ backgroundColor: 'var(--color-bg-card)', boxShadow: 'var(--shadow-card)' }}
            >
              <div className="mb-2 aspect-[2/3] w-full rounded-md" style={{ backgroundColor: 'var(--color-bg-surface)' }} />
              <div className="mb-1 h-3 w-5/6 rounded" style={{ backgroundColor: 'var(--color-bg-surface)' }} />
              <div className="h-2.5 w-2/3 rounded" style={{ backgroundColor: 'var(--color-bg-surface)' }} />
            </div>
          ))
          : books.map((book) => {
            const isSelected = selectedBookIds.includes((book.id || book._id));
            const isInBasket = basketBookIds.includes((book.id || book._id));
            const shelf = shelves.find((s) => s.id === book.shelf);
            return (
              <div
                key={(book.id || book._id)}
                className={
                  "relative flex cursor-pointer flex-col rounded-xl p-2.5 pb-8 text-xs transition-all duration-200 " +
                  (showMergeUi && isSelected
                    ? "ring-2 ring-sky-500"
                    : "hover:translate-y-[-1px]")
                }
                style={{
                  backgroundColor: 'var(--color-bg-card)',
                  boxShadow: 'var(--shadow-card)',
                  color: 'var(--color-text-secondary)',
                }}
                onClick={() => {
                  setSelectedBook(book);
                  setDownloadOpen(false);
                }}
              >
                {showMergeUi && (
                  <div className="absolute left-1.5 top-1.5 z-10">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      onChange={(e) => toggleBookSelection((book.id || book._id), e)}
                      className="h-3 w-3 rounded border-slate-500 bg-slate-900 text-sky-500 focus:ring-sky-500"
                      title="Select for manual merge"
                    />
                  </div>
                )}
                <div className="mb-2 aspect-[2/3] w-full overflow-hidden rounded-lg" style={{ backgroundColor: 'var(--color-bg-surface)' }}>
                  {(book.id || book._id) ? (
                    <img
                      src={
                        getCoverUrl(book) ||
                        `${ API_BASE }/books/${ (book.id || book._id) }/cover`
                      }
                      alt={book.title || "Book cover"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onLoad={(e) => {
                        e.currentTarget.style.visibility = "visible";
                      }}
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  ) : null}
                </div>
                {Number.isFinite(book.readingProgress) && book.readingProgress > 0 && (
                  <div
                    className="-mt-1 mb-1.5 h-[3px] w-full overflow-hidden rounded-full"
                    style={{ backgroundColor: 'var(--color-bg-surface)' }}
                    title={`${Math.round(book.readingProgress)}% read`}
                    aria-label={`${Math.round(book.readingProgress)}% read`}
                  >
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{ width: `${Math.min(100, Math.max(0, book.readingProgress))}%` }}
                    />
                  </div>
                )}
                <div className="mb-0.5 line-clamp-2 font-serif font-medium text-[13px]" style={{ color: 'var(--color-text-primary)' }}>
                  {book.title || "Untitled"}
                </div>
                <div className="truncate text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  {Array.isArray(book.authors) && book.authors.length > 0
                    ? book.authors.join(", ")
                    : "Unknown author"}
                </div>
                {(book.owned || (shelf && shelf.id !== "all")) && (
                  <div className="absolute bottom-2 right-2.5 flex gap-1">
                    {book.owned && (
                      <span className="rounded-full border border-emerald-500/70 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
                        Owned
                      </span>
                    )}
                    {shelf && shelf.id !== "all" && (
                      <span className={shelf.pillClass}>
                        {shelf.label}
                      </span>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  title={isInBasket ? "Remove from device basket" : "Add to device basket"}
                  onClick={(e) => toggleBasket((book.id || book._id), e)}
                  className={
                    "absolute bottom-2 left-2 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] transition-colors " +
                    (isInBasket
                      ? "border-amber-500 bg-amber-600/80 text-white"
                      : "border-slate-700 bg-slate-900/80 text-slate-400 hover:border-amber-500 hover:text-amber-300")
                  }
                  aria-label={isInBasket ? "Remove from device basket" : "Add to device basket"}
                >
                  {isInBasket ? "✓" : "+"}
                </button>
              </div>
            );
          })}
      </div>

      {showMergeUi && mergeSelectionError && (
        <div className="mt-2 text-[11px] text-rose-400">
          {mergeSelectionError}
        </div>
      )}

      {hasMore && !loading && (
        <div
          ref={loadMoreRef}
          className="mt-3 h-6 w-full text-center text-[11px] text-slate-500"
        >
          {loadingMore ? "Loading more…" : "Scroll to load more"}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 md:mt-4 md:text-xs">
        <span>
          {loading
            ? "Fetching data from API…"
            : error
              ? "Error talking to API. Check containers and .env."
              : books.length === 0
                ? "Connected to API. No books in the database yet."
                : `Connected to API. Loaded ${ books.length } book${ books.length === 1 ? "" : "s"
                }.`}
        </span>
      </div>
    </main>
  );
}
