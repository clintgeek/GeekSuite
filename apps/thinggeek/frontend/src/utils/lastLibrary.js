/**
 * The library's last query string, remembered for this tab so the
 * insurance report can offer "just what the library is showing" — the
 * report is its own page, reached from the sidebar without the filter in
 * its URL. Memory only: a reload starts from the whole ledger.
 */
let last = '';

export function rememberLibrarySearch(search) {
  last = search || '';
}

export function lastLibrarySearch() {
  return last;
}
