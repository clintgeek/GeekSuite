/**
 * The library's filters live in the URL — `/?q=&shelf=&author=&tag=&sort=&dir=`
 * — like GameGeek's, so a filtered view is a link, survives a reload, and the
 * detail sheet (`/book/:id?…`) keeps the list it opened over.
 *
 * Defaults are left out of the URL (`shelf=all`, `sort=title`, `dir=asc`), so
 * the bare `/` is the whole library.
 *
 * Why a provider and a batch instead of `useSearchParams` in each component:
 * the views call several setters in one handler ("Clear filters" is four
 * calls; a sidebar shelf row is a shelf AND "go to the library"), and
 * react-router's `setSearchParams` reads the params of the render it closed
 * over — so four calls in one tick would each overwrite the last. Here every
 * change in a tick lands in one pending patch and one navigation.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LIBRARY_PATH, SETTINGS_PATH, viewForPath } from "../components/navConfig";
import { readLibraryParams, writeLibraryParams } from "../utils/libraryParams";

const LibraryParamsContext = createContext(null);

export function LibraryParamsProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  // The latest location, read at flush time rather than from a closure.
  const latest = useRef(location);
  latest.current = location;
  const pending = useRef(null);

  const flush = useCallback(() => {
    const change = pending.current;
    pending.current = null;
    if (!change) return;
    const here = latest.current;
    const search = writeLibraryParams(here.search, change.params);
    const pathname = change.pathname ?? here.pathname;
    if (pathname === here.pathname && search === here.search) return;
    // A filter change replaces the entry (typing a search is not twenty
    // history steps); moving between views pushes one.
    navigate({ pathname, search }, { replace: pathname === here.pathname });
    latest.current = { ...here, pathname, search };
  }, [navigate]);

  const queue = useCallback(
    (change) => {
      const first = !pending.current;
      pending.current = {
        params: { ...(pending.current?.params || {}), ...(change.params || {}) },
        pathname: change.pathname ?? pending.current?.pathname,
      };
      if (first) queueMicrotask(flush);
    },
    [flush]
  );

  const filters = useMemo(() => readLibraryParams(location.search), [location.search]);

  // The search box is a controlled input, and the URL only catches up a
  // microtask later — long enough for React to put the old value back and
  // throw the caret to the end mid-edit. So the typed text is state, set
  // synchronously, and follows the URL whenever the URL moves on its own
  // (Back, a saved filter, "Clear filters").
  const [searchDraft, setSearchDraft] = useState(filters.searchQuery);
  useEffect(() => {
    setSearchDraft(filters.searchQuery);
  }, [filters.searchQuery]);

  const setters = useMemo(() => {
    const one = (name) => (value) => queue({ params: { [name]: value } });
    return {
      setSearchQuery: (value) => {
        setSearchDraft(value ?? "");
        queue({ params: { searchQuery: value } });
      },
      setShelfFilter: one("shelfFilter"),
      setAuthorFilter: one("authorFilter"),
      setTagFilter: one("tagFilter"),
      setSortBy: one("sortBy"),
      setSortDir: one("sortDir"),
      setFilters: (patch) => queue({ params: patch }),
      /** "library" | "profile" — the two views the old `activeView` named. */
      // Going "to the library" from the library (or from a detail sheet over
      // it) changes no path: the sheet stays up, as the old modal did.
      setActiveView: (view) => {
        if (view === "profile") {
          queue({ pathname: SETTINGS_PATH });
          return;
        }
        const target = pending.current?.pathname ?? latest.current.pathname;
        if (viewForPath(target) === "profile") queue({ pathname: LIBRARY_PATH });
      },
    };
  }, [queue]);

  const activeView = viewForPath(location.pathname);

  const value = useMemo(
    () => ({ ...filters, searchQuery: searchDraft, ...setters, activeView, search: location.search }),
    [filters, searchDraft, setters, activeView, location.search]
  );

  return <LibraryParamsContext.Provider value={value}>{children}</LibraryParamsContext.Provider>;
}

export function useLibraryParams() {
  const ctx = useContext(LibraryParamsContext);
  if (!ctx) throw new Error("useLibraryParams needs a LibraryParamsProvider");
  return ctx;
}
