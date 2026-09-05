/**
 * BookGeek book detail modal — the overlay opened by clicking a library card.
 *
 * Lifted verbatim out of `App.jsx`: cover tools, download/send/read actions,
 * inline metadata editing, shelf + reading progress, delete, and description.
 * Every piece of state still lives in `App` and arrives here as a prop.
 */
import React from "react";
import { API_BASE, formatDescriptionForDisplay, getCoverUrl } from "../utils/bookDisplay";

export default function BookDetailModal({
  basketBookIds,
  beginEditForSelectedBook,
  cancelEditForSelectedBook,
  closeBookModal,
  convertingFormat,
  coverApplyLoadingId,
  coverDeleteLoading,
  coverSearchError,
  coverSearchLoading,
  coverSearchQuery,
  coverSearchResults,
  coverUploadFile,
  coverUploadLoading,
  deleteConfirmOpen,
  deleteError,
  deleteIncludeFiles,
  deleteLoading,
  downloadOpen,
  editDraft,
  editError,
  editMode,
  editSaving,
  enrichError,
  enrichLoading,
  enrichSummary,
  handleApplyCoverCandidate,
  handleCoverFileChange,
  handleDeleteCoverForSelectedBook,
  handleDeleteSelectedBook,
  handleDownload,
  handleEnrichSelectedBook,
  handleSaveEditForSelectedBook,
  handleSearchCoversForSelectedBook,
  handleSendToKindle,
  handleUpdateProgress,
  handleUpdateShelf,
  handleUploadBookFile,
  handleUploadCoverForSelectedBook,
  handleUploadFileChange,
  progressDraft,
  progressError,
  progressSavingId,
  scheduleProgressCommit,
  selectedBook,
  sendToKindleError,
  sendToKindleLoading,
  sendToKindleStatus,
  setCoverSearchQuery,
  setDeleteConfirmOpen,
  setDeleteError,
  setDeleteIncludeFiles,
  setDownloadOpen,
  setEditDraft,
  setProgressDraft,
  setReaderError,
  setReaderOpen,
  setShowCoverTools,
  shelfSavingId,
  shelves,
  showCoverTools,
  toggleBasket,
  uploadError,
  uploadFile,
  uploadLoading,
  uploadMessage,
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-2 py-4"
      onClick={closeBookModal}
    >
      <div
        className="mx-auto flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 md:text-base">
              Book Details
            </h2>
            <p className="text-[11px] text-slate-500">
              From your BookGeek library
            </p>
          </div>
          <button
            type="button"
            onClick={closeBookModal}
            aria-label="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-sm font-semibold text-slate-300 hover:border-slate-500 hover:text-slate-50"
          >
            ×
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 md:flex-row">
          <div className="mx-auto w-32 flex-shrink-0 md:mx-0 md:w-40">
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md border border-slate-800 bg-slate-900">
              {(selectedBook.id || selectedBook._id) ? (
                <img
                  src={getCoverUrl(selectedBook) || `${ API_BASE }/books/${ (selectedBook.id || selectedBook._id) }/cover`}
                  alt={selectedBook.title || "Book cover"}
                  className="h-full w-full object-cover"
                  onLoad={(e) => {
                    e.currentTarget.style.visibility = "visible";
                  }}
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
              ) : null}
              <button
                type="button"
                onClick={() => setShowCoverTools((v) => !v)}
                className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-950/80 text-[11px] text-slate-200 hover:border-sky-500 hover:text-sky-100"
                title="Edit cover"
              >
                ✎
              </button>
            </div>
            {showCoverTools && (
              <div className="mt-2 space-y-1 text-[11px]">
                <div className="flex flex-wrap items-center gap-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCoverFileChange}
                    className="flex-1 min-w-[120px] text-[10px] text-slate-200 file:mr-1 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-[10px] file:text-slate-100 hover:file:bg-slate-700"
                  />
                  <button
                    type="button"
                    onClick={handleUploadCoverForSelectedBook}
                    disabled={coverUploadLoading || !coverUploadFile}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-100 hover:border-slate-500 disabled:opacity-60"
                  >
                    {coverUploadLoading ? "Uploading…" : "Upload cover"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteCoverForSelectedBook}
                    disabled={coverDeleteLoading}
                    className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] text-slate-300 hover:border-rose-500 hover:text-rose-100 disabled:opacity-60"
                  >
                    {coverDeleteLoading ? "Removing…" : "Remove"}
                  </button>
                </div>
                <input
                  type="text"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                  placeholder="Search covers…"
                  value={coverSearchQuery}
                  onChange={(e) => setCoverSearchQuery(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleSearchCoversForSelectedBook}
                  disabled={coverSearchLoading}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 hover:border-slate-500 disabled:opacity-60"
                >
                  {coverSearchLoading ? "Searching covers…" : "Search covers"}
                </button>
                {coverSearchError && (
                  <div className="text-[10px] text-rose-400">
                    {coverSearchError}
                  </div>
                )}
                {Array.isArray(coverSearchResults) &&
                  coverSearchResults.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-400">
                        Choose a cover:
                      </div>
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-2">
                        {coverSearchResults.slice(0, 9).map((candidate) => {
                          const key =
                            typeof candidate.id === "string"
                              ? candidate.id
                              : `cover-${ String(
                                candidate.coverId ?? ""
                              ) }`;
                          const isApplying = coverApplyLoadingId === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() =>
                                handleApplyCoverCandidate(candidate)
                              }
                              disabled={!!coverApplyLoadingId}
                              className="relative overflow-hidden rounded border border-slate-700 bg-slate-900"
                            >
                              <img
                                src={candidate.thumbUrl}
                                alt={candidate.title || "Cover option"}
                                className="h-28 w-full object-cover"
                              />
                              {isApplying && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[11px] text-slate-100">
                                  Applying…
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3 text-sm text-slate-100">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <div className="relative inline-block">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-60"
                    disabled={!!convertingFormat}
                    onClick={() => setDownloadOpen((open) => !open)}
                  >
                    <span>
                      {convertingFormat
                        ? `Converting ${ convertingFormat.toUpperCase() }…`
                        : "Download"}
                    </span>
                    <span className="ml-1 text-[10px]">▾</span>
                  </button>

                  {downloadOpen && (
                    <div className="absolute left-0 z-10 mt-1 w-44 overflow-hidden rounded-md border border-slate-800 bg-slate-950 text-[11px] text-slate-100 shadow-xl">
                      {["epub", "azw3", "mobi"].map((format) => {
                        const existing = (selectedBook.files || []).find(
                          (f) => (f.format || "").toLowerCase() === format
                        );

                        let sizeLabel = "";
                        if (convertingFormat === format) {
                          sizeLabel = "Converting…";
                        } else if (existing) {
                          const sizeBytes = existing.size || 0;
                          const sizeMB = sizeBytes / (1024 * 1024);
                          sizeLabel =
                            sizeMB >= 0.1
                              ? `${ sizeMB.toFixed(1) } MB`
                              : `${ (sizeBytes / 1024).toFixed(0) } KB`;
                        } else {
                          sizeLabel = "Not available";
                        }

                        return (
                          <button
                            key={format}
                            type="button"
                            className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-slate-800"
                            disabled={!!convertingFormat}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(selectedBook, format);
                            }}
                          >
                            <span className="mr-2 font-medium">
                              {format.toUpperCase()}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {sizeLabel}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
                  type="button"
                  disabled={sendToKindleLoading}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSendToKindle(selectedBook);
                  }}
                >
                  {sendToKindleLoading ? "Sending…" : "Send EPUB to eReader"}
                </button>
                <button
                  className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setReaderError(null);
                    setReaderOpen(true);
                  }}
                >
                  Read in Browser · EPUB
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleBasket((selectedBook.id || selectedBook._id), e);
                  }}
                  className={
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors " +
                    (basketBookIds.includes((selectedBook.id || selectedBook._id))
                      ? "bg-amber-600 text-white hover:bg-amber-500"
                      : "border border-amber-600/60 bg-amber-900/30 text-amber-200 hover:bg-amber-900/60")
                  }
                  title="Add this book to a device download basket (Kindle)"
                >
                  {basketBookIds.includes((selectedBook.id || selectedBook._id))
                    ? "In basket ✓"
                    : "Add to basket"}
                </button>
                {(!selectedBook.owned ||
                  !selectedBook.files ||
                  selectedBook.files.length === 0) && (
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                      <input
                        type="file"
                        accept=".epub,.mobi,.azw3,.pdf,.fb2,.rtf,.txt,.html"
                        onChange={handleUploadFileChange}
                        className="text-[10px] text-slate-200 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-[10px] file:text-slate-100 hover:file:bg-slate-700"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUploadBookFile(selectedBook);
                        }}
                        disabled={uploadLoading || !uploadFile}
                        className="inline-flex items-center rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-medium text-slate-50 hover:border-slate-500 disabled:opacity-60"
                      >
                        {uploadLoading ? "Attaching…" : "Attach file"}
                      </button>
                      {uploadError && (
                        <div className="w-full text-[10px] text-rose-400">
                          {uploadError}
                        </div>
                      )}
                      {uploadMessage && (
                        <div className="w-full text-[10px] text-emerald-300">
                          {uploadMessage}
                        </div>
                      )}
                    </div>
                  )}
              </div>

              <div>
                {editMode ? (
                  <div className="space-y-1">
                    <input
                      type="text"
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-sky-500"
                      value={editDraft?.title || ""}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...(prev || {}),
                          title: e.target.value,
                        }))
                      }
                      placeholder="Title"
                    />
                    <input
                      type="text"
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-500"
                      value={editDraft?.authors || ""}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...(prev || {}),
                          authors: e.target.value,
                        }))
                      }
                      placeholder="Authors (comma-separated)"
                    />
                  </div>
                ) : (
                  <>
                    <h3 className="text-base font-bold font-serif text-slate-100 md:text-lg">
                      {selectedBook.title || "Untitled"}
                    </h3>
                    {Array.isArray(selectedBook.authors) &&
                      selectedBook.authors.length > 0 && (
                        <div className="text-xs text-sky-400">
                          {selectedBook.authors.join(", ")}
                        </div>
                      )}
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                {editMode ? (
                  <div className="flex flex-wrap gap-2 w-full">
                    <input
                      type="text"
                      className="min-w-[90px] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                      placeholder="Language"
                      value={editDraft?.language || ""}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...(prev || {}),
                          language: e.target.value,
                        }))
                      }
                    />
                    <input
                      type="text"
                      className="min-w-[120px] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                      placeholder="ISBN"
                      value={editDraft?.isbn || ""}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...(prev || {}),
                          isbn: e.target.value,
                        }))
                      }
                    />
                    <input
                      type="text"
                      className="min-w-[120px] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                      placeholder="ISBN13"
                      value={editDraft?.isbn13 || ""}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...(prev || {}),
                          isbn13: e.target.value,
                        }))
                      }
                    />
                    <input
                      type="text"
                      className="min-w-[120px] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                      placeholder="Goodreads ID"
                      value={editDraft?.goodreadsId || ""}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...(prev || {}),
                          goodreadsId: e.target.value,
                        }))
                      }
                    />
                  </div>
                ) : (
                  <>
                    {selectedBook.language && (
                      <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5">
                        <span className="mr-1 text-[10px] uppercase text-slate-500">
                          Language
                        </span>
                        <span>{selectedBook.language}</span>
                      </span>
                    )}
                    {selectedBook.isbn && (
                      <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5">
                        <span className="mr-1 text-[10px] uppercase text-slate-500">
                          ISBN
                        </span>
                        <span>{selectedBook.isbn}</span>
                      </span>
                    )}
                    {selectedBook.goodreadsId && (
                      <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5">
                        <span className="mr-1 text-[10px] uppercase text-slate-500">
                          Goodreads
                        </span>
                        <span>{selectedBook.goodreadsId}</span>
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {editMode ? (
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <input
                  type="text"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                  placeholder="Tags (comma-separated)"
                  value={editDraft?.tags || ""}
                  onChange={(e) =>
                    setEditDraft((prev) => ({
                      ...(prev || {}),
                      tags: e.target.value,
                    }))
                  }
                />
              </div>
            ) : (
              Array.isArray(selectedBook.tags) &&
              selectedBook.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {selectedBook.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )
            )}

            <div className="space-y-1 text-[11px] text-slate-400">
              {editMode ? (
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    className="min-w-[140px] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                    placeholder="Publisher"
                    value={editDraft?.publisher || ""}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...(prev || {}),
                        publisher: e.target.value,
                      }))
                    }
                  />
                  <input
                    type="date"
                    className="min-w-[140px] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                    value={editDraft?.publishedDate || ""}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...(prev || {}),
                        publishedDate: e.target.value,
                      }))
                    }
                  />
                </div>
              ) : (
                <>
                  {selectedBook.publisher && (
                    <div>
                      <span className="font-medium text-slate-300">
                        Publisher:
                      </span>{" "}
                      <span>{selectedBook.publisher}</span>
                    </div>
                  )}
                  {selectedBook.publishedDate && (
                    <div>
                      <span className="font-medium text-slate-300">
                        Published:
                      </span>{" "}
                      <span>
                        {new Date(
                          selectedBook.publishedDate
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </>
              )}
              {editMode ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1">
                    <span className="font-medium text-slate-300">
                      Rating:
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="5"
                      step="0.5"
                      className="w-16 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                      value={editDraft?.rating || ""}
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...(prev || {}),
                          rating: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
              {selectedBook.owned && (
                <div>
                  <span className="font-medium text-slate-300">
                    Owned:
                  </span>{" "}
                  <span>Yes</span>
                </div>
              )}
              {typeof selectedBook.rating === "number" &&
                selectedBook.rating > 0 && (
                  <div>
                    <span className="font-medium text-slate-300">
                      Rating:
                    </span>{" "}
                    {(() => {
                      const r = Math.round(selectedBook.rating);
                      const stars = "★".repeat(Math.max(0, Math.min(5, r)));
                      const empty = "☆".repeat(Math.max(0, 5 - r));
                      return (
                        <span>
                          <span className="text-amber-300">
                            {stars}
                          </span>
                          <span className="text-slate-500">{empty}</span>{" "}
                          <span className="text-slate-300">
                            ({selectedBook.rating}/5)
                          </span>
                        </span>
                      );
                    })()}
                  </div>
                )}
              {selectedBook.dateFinished && (
                <div>
                  <span className="font-medium text-slate-300">
                    Finished:
                  </span>{" "}
                  <span>
                    {new Date(selectedBook.dateFinished).toLocaleDateString()}
                  </span>
                </div>
              )}
              {selectedBook.dateAdded && (
                <div>
                  <span className="font-medium text-slate-300">
                    Added:
                  </span>{" "}
                  <span>
                    {new Date(selectedBook.dateAdded).toLocaleDateString()}
                  </span>
                </div>
              )}
              {typeof selectedBook.readCount === "number" &&
                selectedBook.readCount > 0 && (
                  <div>
                    <span className="font-medium text-slate-300">
                      Read count:
                    </span>{" "}
                    <span>{selectedBook.readCount}</span>
                  </div>
                )}
              {editMode ? (
                <div className="mt-1 space-y-1">
                  <div className="font-medium text-slate-300">Review:</div>
                  <textarea
                    className="h-20 w-full resize-y rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                    placeholder="Your review or notes for this book"
                    value={editDraft?.review || ""}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...(prev || {}),
                        review: e.target.value,
                      }))
                    }
                  />
                </div>
              ) : (
                selectedBook.review && (
                  <div>
                    <span className="font-medium text-slate-300">
                      Review:
                    </span>{" "}
                    <span className="whitespace-pre-wrap text-slate-200">
                      {selectedBook.review}
                    </span>
                  </div>
                )
              )}
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-300">Shelf:</span>
                <select
                  className="min-w-[140px] rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none [color-scheme:dark] focus:border-slate-500"
                  value={selectedBook.shelf || ""}
                  disabled={
                    !!shelfSavingId && shelfSavingId === (selectedBook.id || selectedBook._id)
                  }
                  onChange={(e) =>
                    handleUpdateShelf(selectedBook, e.target.value)
                  }
                >
                  <option value="">Assign shelf…</option>
                  {shelves
                    .filter((s) => s.id !== "all")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-300">Progress:</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={progressDraft === "" ? 0 : progressDraft}
                  disabled={!!progressSavingId && progressSavingId === (selectedBook.id || selectedBook._id)}
                  onChange={(e) => {
                    setProgressDraft(Number(e.target.value));
                    scheduleProgressCommit(selectedBook, e.target.value);
                  }}
                  className="w-36 accent-amber-500"
                  aria-label="Percent read"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  value={progressDraft}
                  disabled={!!progressSavingId && progressSavingId === (selectedBook.id || selectedBook._id)}
                  onChange={(e) => {
                    const v = e.target.value === "" ? "" : Number(e.target.value);
                    setProgressDraft(v);
                    if (v !== "") scheduleProgressCommit(selectedBook, v);
                  }}
                  onBlur={(e) => handleUpdateProgress(selectedBook, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleUpdateProgress(selectedBook, e.currentTarget.value);
                    }
                  }}
                  className="w-14 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right text-[11px] text-slate-100 outline-none [color-scheme:dark] focus:border-slate-500"
                  aria-label="Percent read"
                />
                <span className="text-slate-400">%</span>
                {selectedBook.pageCount > 0 && progressDraft !== "" && (
                  <span className="text-[11px] text-slate-500">
                    about p. {Math.round((Number(progressDraft) / 100) * selectedBook.pageCount)} of {selectedBook.pageCount}
                  </span>
                )}
                {progressSavingId && progressSavingId === (selectedBook.id || selectedBook._id) && (
                  <span className="text-[11px] text-slate-500">Saving…</span>
                )}
                {progressError && (
                  <span className="text-[11px] text-rose-400">{progressError}</span>
                )}
              </div>
            </div>

            {sendToKindleError && (
              <div className="text-[11px] text-rose-400">
                {sendToKindleError}
              </div>
            )}
            {sendToKindleStatus && (
              <div className="text-[11px] text-emerald-300">
                Sending to {sendToKindleStatus.kindleEmail}
              </div>
            )}
            <div className="mt-2 border-t border-slate-800 pt-2 text-[11px] text-slate-400">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {editMode ? (
                      <>
                        <button
                          type="button"
                          onClick={handleSaveEditForSelectedBook}
                          disabled={editSaving}
                          className="rounded border border-sky-600 bg-sky-800 px-3 py-1 text-[11px] font-semibold text-sky-50 hover:border-sky-400 hover:bg-sky-700 disabled:opacity-60"
                        >
                          {editSaving ? "Saving…" : "Save changes"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditForSelectedBook}
                          disabled={editSaving}
                          className="rounded border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={beginEditForSelectedBook}
                          className="rounded border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-medium text-slate-200 hover:border-sky-500 hover:text-sky-200"
                        >
                          Edit metadata…
                        </button>
                        <button
                          type="button"
                          onClick={handleEnrichSelectedBook}
                          disabled={enrichLoading}
                          className="rounded border border-emerald-700 bg-emerald-950/60 px-3 py-1 text-[11px] font-medium text-emerald-200 hover:border-emerald-500 hover:bg-emerald-900/80 disabled:opacity-60"
                        >
                          {enrichLoading ? "Enriching metadata…" : "Enrich metadata"}
                        </button>
                      </>
                    )}
                  </div>
                  {(editError || enrichError || enrichSummary) && (
                    <div className="space-y-0.5">
                      {editError && (
                        <div className="text-rose-400">{editError}</div>
                      )}
                      {enrichError && (
                        <div className="text-rose-400">{enrichError}</div>
                      )}
                      {enrichSummary && (
                        <div className="text-emerald-300">{enrichSummary}</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex-1"></div>
                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {deleteError && (
                    <div className="mb-1 text-rose-400">{deleteError}</div>
                  )}
                  {deleteConfirmOpen ? (
                    <>
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          className="h-3 w-3 rounded border-slate-500 bg-slate-900 text-rose-500 focus:ring-rose-500"
                          checked={deleteIncludeFiles}
                          onChange={(e) =>
                            setDeleteIncludeFiles(e.target.checked)
                          }
                        />
                        <span>Also delete files</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (!deleteLoading) {
                            setDeleteConfirmOpen(false);
                            setDeleteError(null);
                            setDeleteIncludeFiles(false);
                          }
                        }}
                        className="rounded border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-200 hover:border-slate-500"
                        disabled={deleteLoading}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteSelectedBook}
                        disabled={deleteLoading}
                        className="rounded border border-rose-600 bg-rose-800 px-3 py-1 text-[11px] font-semibold text-rose-50 hover:border-rose-400 hover:bg-rose-700 disabled:opacity-60"
                      >
                        {deleteLoading ? "Deleting…" : "Delete book"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteConfirmOpen(true);
                        setDeleteError(null);
                      }}
                      className="rounded border border-rose-700 bg-rose-950/60 px-3 py-1 text-[11px] font-medium text-rose-200 hover:border-rose-500 hover:bg-rose-900/80"
                    >
                      Delete this book…
                    </button>
                  )}
                </div>
              </div>
            </div>
            {selectedBook.description && (
              <div className="mt-2 space-y-1 text-[13px] leading-relaxed text-slate-200">
                <div className="text-sm font-semibold text-slate-100">
                  Description
                </div>
                <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-200">
                  {formatDescriptionForDisplay(selectedBook.description)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
