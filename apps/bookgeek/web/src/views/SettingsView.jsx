/**
 * BookGeek settings view — the "profile" pane behind the sidebar's Settings.
 *
 * Lifted verbatim out of `App.jsx`: profile + Kindle/device word, default
 * shelf, custom shelves, AI status, Goodreads import/dedupe and the library
 * rescan. State stays in `App`; this component only renders what it is given.
 */
import React from "react";
import { loginRedirect } from "@geeksuite/auth";

export default function SettingsView({
  aiStatus,
  aiStatusError,
  aiStatusLoading,
  authError,
  authLoading,
  calibreRescanError,
  calibreRescanLoading,
  calibreRescanSummary,
  customShelves,
  defaultShelfPref,
  deviceWordInput,
  goodreadsDedupeError,
  goodreadsDedupeLoading,
  goodreadsDedupeSummary,
  goodreadsFile,
  goodreadsImportError,
  goodreadsImportLoading,
  goodreadsImportSummary,
  handleAddCustomShelf,
  handleCalibreRescan,
  handleCheckAiStatus,
  handleDeleteCustomShelf,
  handleGoodreadsDedupe,
  handleGoodreadsFileChange,
  handleGoodreadsImport,
  handleLogout,
  handleSaveDefaultShelf,
  handleSaveProfile,
  kindleEmailInput,
  newShelfLabel,
  prefSaveError,
  prefSaveLoading,
  prefSaveMessage,
  profileError,
  profileLoading,
  profileMessage,
  setActiveView,
  setAuthError,
  setAuthLoading,
  setDefaultShelfPref,
  setDeviceWordInput,
  setKindleEmailInput,
  setNewShelfLabel,
  setShelfFilter,
  shelfEditError,
  shelfEditLoading,
  shelves,
  user,
}) {
  return (
    <section className="flex-1 rounded-xl p-3.5 md:p-4" style={{ backgroundColor: 'var(--color-bg-surface-alt)', border: '1px solid var(--color-border)' }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] md:text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Manage your account and Kindle email for send-to-device.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setActiveView("library");
            setShelfFilter("all");
          }}
          className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800"
        >
          ← Back to library
        </button>
      </div>

      {!user ? (
        <div className="max-w-sm space-y-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Sign in with your baseGeek account to enable BookGeek
            features tied to your profile.
          </div>
          {authError && (
            <div className="text-[10px] text-rose-700 dark:text-rose-400">{authError}</div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={authLoading}
              onClick={() => {
                setAuthLoading(true);
                setAuthError(null);
                loginRedirect("bookgeek", window.location.href, "login");
              }}
              className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:border-slate-500 dark:hover:bg-slate-800 disabled:opacity-60"
            >
              {authLoading ? "Redirecting…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => setActiveView("library")}
              className="text-[11px] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] text-slate-600 dark:text-slate-300">
              Signed in as{" "}
              <span className="font-medium">
                {user.email || user.username || "unknown"}
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-800"
            >
              Log out
            </button>
          </div>

          <form
            className="max-w-sm space-y-2"
            onSubmit={handleSaveProfile}
          >
            <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
              Kindle email address
            </div>
            <p className="text-[11px] text-slate-500">
              This is where BookGeek will send EPUBs when you choose
              &quot;Send to eReader&quot;.
            </p>
            <input
              type="email"
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-900 outline-none focus:border-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              placeholder="yourname@kindle.com"
              value={kindleEmailInput}
              onChange={(e) => setKindleEmailInput(e.target.value)}
            />

            <div className="pt-2 text-[11px] font-medium text-slate-700 dark:text-slate-200">
              Device word
            </div>
            <p className="text-[11px] text-slate-500">
              Used on your e-reader at /download-basket to fetch your
              basket.
            </p>
            <input
              type="text"
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-900 outline-none focus:border-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              placeholder="mustang"
              value={deviceWordInput}
              onChange={(e) =>
                setDeviceWordInput(e.target.value.toLowerCase())
              }
            />
            {profileError && (
              <div className="text-[10px] text-rose-700 dark:text-rose-400">
                {profileError}
              </div>
            )}
            {profileMessage && (
              <div className="text-[10px] text-emerald-700 dark:text-emerald-300">
                {profileMessage}
              </div>
            )}
            <button
              type="submit"
              disabled={profileLoading}
              className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:border-slate-500 dark:hover:bg-slate-800 disabled:opacity-60"
            >
              {profileLoading ? "Saving…" : "Save profile"}
            </button>
          </form>

          <div className="border-t border-slate-200 pt-3 dark:border-slate-800 text-[11px] text-slate-500 space-y-4">
            <div>
              <div className="mb-1 text-[11px] font-medium text-slate-700 dark:text-slate-200">
                Library default shelf
              </div>
              <p className="mb-2 text-[11px] text-slate-500">
                Choose which shelf loads by default when you open BookGeek.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <select
                  className="w-full max-w-xs rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-900 outline-none focus:border-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  value={defaultShelfPref}
                  onChange={(e) => setDefaultShelfPref(e.target.value)}
                >
                  {shelves.map((shelf) => (
                    <option key={shelf.id} value={shelf.id}>
                      {shelf.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleSaveDefaultShelf}
                  disabled={prefSaveLoading}
                  className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:border-slate-500 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  {prefSaveLoading ? "Saving…" : "Save default shelf"}
                </button>
              </div>
              {prefSaveError && (
                <div className="mt-1 text-[10px] text-rose-700 dark:text-rose-400">{prefSaveError}</div>
              )}
              {prefSaveMessage && (
                <div className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">{prefSaveMessage}</div>
              )}
            </div>

            <div>
              <div className="mb-1 text-[11px] font-medium text-slate-700 dark:text-slate-200">
                Custom shelves
              </div>
              <p className="mb-2 text-[11px] text-slate-500">
                Add your own shelves alongside the built-in ones. They show in the sidebar with a book icon.
              </p>
              {customShelves.length > 0 && (
                <ul className="mb-2 flex flex-wrap gap-1.5">
                  {customShelves.map((shelf) => (
                    <li
                      key={shelf.id}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <span>{shelf.label}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomShelf(shelf.id)}
                        disabled={shelfEditLoading}
                        className="ml-0.5 rounded px-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-60"
                        aria-label={`Remove shelf ${shelf.label}`}
                        title="Remove shelf"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form
                onSubmit={handleAddCustomShelf}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
              >
                <input
                  type="text"
                  value={newShelfLabel}
                  onChange={(e) => setNewShelfLabel(e.target.value)}
                  maxLength={40}
                  placeholder="New shelf name"
                  className="w-full max-w-xs rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-900 outline-none focus:border-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="submit"
                  disabled={shelfEditLoading || !newShelfLabel.trim()}
                  className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:border-slate-500 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  {shelfEditLoading ? "Saving…" : "Add shelf"}
                </button>
              </form>
              {shelfEditError && (
                <div className="mt-1 text-[10px] text-rose-700 dark:text-rose-400">{shelfEditError}</div>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={handleCheckAiStatus}
                disabled={aiStatusLoading}
                className="rounded border border-emerald-600/70 bg-emerald-100 px-3 py-1.5 text-[11px] text-emerald-800 hover:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:border-emerald-400 disabled:opacity-60"
              >
                {aiStatusLoading ? "Checking AI…" : "Check AI status"}
              </button>
              {aiStatus && (
                <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  AI:{" "}
                  <span className="font-medium">
                    {aiStatus.enabled ? "enabled" : "disabled"}
                  </span>
                  {" · "}
                  key:{" "}
                  {aiStatus.apiKeyConfigured ? "configured" : "missing"}
                </div>
              )}
              {aiStatusError && (
                <div className="mt-1 text-[10px] text-rose-700 dark:text-rose-400">
                  {aiStatusError}
                </div>
              )}
            </div>

            <div>
              <div className="mb-1 text-[11px] font-medium text-slate-700 dark:text-slate-200">
                Goodreads import
              </div>
              <p className="mb-2 text-[11px] text-slate-500">
                Upload your Goodreads library CSV export to import ratings,
                shelves, and read dates onto your existing books.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleGoodreadsFileChange}
                  className="text-[11px] text-slate-700 file:mr-2 file:rounded file:border-0 file:bg-slate-200 file:px-2 file:py-1.5 file:text-[11px] file:text-slate-900 hover:file:bg-slate-300 dark:text-slate-200 dark:file:bg-slate-800 dark:file:text-slate-100 dark:hover:file:bg-slate-700"
                />
                <button
                  type="button"
                  onClick={handleGoodreadsImport}
                  disabled={goodreadsImportLoading || !goodreadsFile}
                  className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:border-slate-500 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  {goodreadsImportLoading
                    ? "Importing from Goodreads…"
                    : "Upload & import"}
                </button>
              </div>
              {goodreadsImportError && (
                <div className="mt-1 text-[10px] text-rose-700 dark:text-rose-400">
                  {goodreadsImportError}
                </div>
              )}
              {goodreadsImportSummary && (
                <div className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">
                  Imported Goodreads CSV: {goodreadsImportSummary.updated ?? 0} updated,
                  {" "}
                  {goodreadsImportSummary.created ?? 0} created,
                  {" "}
                  {goodreadsImportSummary.matched ?? 0} matched to existing,
                  {" "}
                  {goodreadsImportSummary.skippedNoMatch ?? 0} with no usable data.
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleGoodreadsDedupe}
                  disabled={goodreadsDedupeLoading}
                  className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:border-slate-500 dark:hover:bg-slate-800 disabled:opacity-60"
                >
                  {goodreadsDedupeLoading
                    ? "Merging duplicates…"
                    : "Merge Goodreads duplicates"}
                </button>
                {goodreadsDedupeError && (
                  <span className="text-[10px] text-rose-700 dark:text-rose-400">
                    {goodreadsDedupeError}
                  </span>
                )}
                {goodreadsDedupeSummary && (
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-300">
                    Merged {goodreadsDedupeSummary.merged ?? 0} of {" "}
                    {goodreadsDedupeSummary.candidates ?? 0} Goodreads-only books; {" "}
                    updated {goodreadsDedupeSummary.updatedPrimary ?? 0} primaries; {" "}
                    {goodreadsDedupeSummary.skippedNoPrimary ?? 0} skipped with no primary match.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] font-medium text-slate-700 dark:text-slate-200">
              Library rescan
            </div>
            <p className="mb-2 text-[11px] text-slate-500">
              Walks your on-disk BookGeek library and attaches files to existing books,
              marking them as owned, or creates new records if nothing matches.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCalibreRescan}
                disabled={calibreRescanLoading}
                className="inline-flex items-center rounded border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:border-slate-500 dark:hover:bg-slate-800 disabled:opacity-60"
              >
                {calibreRescanLoading
                  ? "Scanning library…"
                  : "Rescan library"}
              </button>
              {calibreRescanError && (
                <span className="text-[10px] text-rose-700 dark:text-rose-400">
                  {calibreRescanError}
                </span>
              )}
              {calibreRescanSummary && (
                <span className="text-[10px] text-emerald-700 dark:text-emerald-300">
                  Scanned {calibreRescanSummary.rows ?? 0} entries; attached to{" "}
                  {calibreRescanSummary.attachedExisting ?? 0} existing books; created{" "}
                  {calibreRescanSummary.createdNew ?? 0} new; skipped{" "}
                  {calibreRescanSummary.skippedNoFiles ?? 0} with no files.
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
