/**
 * The library's filters live in the URL — `/?shelf=read&author=…&tag=…&q=…`,
 * the grammar in utils/libraryFilter.js — through `@geeksuite/collection`'s
 * `useCollectionFilter`, so a filtered view is a link, survives a reload, and
 * the detail sheet (`/book/:id?…`) keeps the list it opened over.
 *
 * Why a provider around it: the top bar's search box and the sidebar's shelf
 * rows live outside the library route (in the shell), and they must drive
 * the same state. Everything reads one `lib` here:
 *
 *   lib               the package's filter state: { state, filterInput,
 *                     activeCount, variables(page), ready, update, toggle,
 *                     remove, clearAll, setSort, reshuffle }
 *   searchQuery /     the top bar's box. The typed text is state, set
 *   setSearchQuery    synchronously and written to `?q=` with replace (a word
 *                     is one history entry, not six), and it follows the URL
 *                     whenever the URL moves on its own (Back, a saved view,
 *                     a cleared chip).
 *   showShelf(id)     a sidebar / shelf-strip row: that shelf ("all" = none),
 *                     the other filters kept; from Settings it also goes back
 *                     to the library (one pushed entry).
 *   activeView,       "library" | "profile" — the two views the shell names
 *   setActiveView     (components/navConfig.jsx).
 *   shelfFilter       the one shelf the list is on, "all" for none, or null
 *                     when several are picked (the sidebar highlights a row
 *                     only for exactly one).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCollectionFilter } from "@geeksuite/collection";
import { LIBRARY_PATH, SETTINGS_PATH, viewForPath } from "../components/navConfig";
import { LIBRARY_CODEC, buildBooksVariables } from "../utils/libraryFilter";

const FILTER_OPTIONS = { buildVariables: buildBooksVariables };

const LibraryParamsContext = createContext(null);

/** The patch that puts the list on one shelf ("all" = no shelf filter). */
const shelfPatch = (id) => ({ shelves: !id || id === "all" ? [] : [id] });

export function LibraryParamsProvider({ children }) {
  const lib = useCollectionFilter(LIBRARY_CODEC, FILTER_OPTIONS);
  const location = useLocation();
  const navigate = useNavigate();
  // The latest location, read at call time rather than from a closure.
  const latest = useRef(location);
  latest.current = location;

  const urlQ = lib.state.filter.q;
  const [searchDraft, setSearchDraft] = useState(urlQ);
  useEffect(() => {
    setSearchDraft(urlQ);
  }, [urlQ]);

  const { update } = lib;
  const setSearchQuery = useCallback(
    (value) => {
      setSearchDraft(value ?? "");
      update({ q: value ?? "" }, { replace: true });
    },
    [update]
  );

  const showShelf = useCallback(
    (id) => {
      const here = latest.current;
      if (viewForPath(here.pathname) === "profile") {
        const s = LIBRARY_CODEC.write(new URLSearchParams(here.search), shelfPatch(id)).toString();
        navigate({ pathname: LIBRARY_PATH, search: s ? `?${ s }` : "" });
        return;
      }
      update(shelfPatch(id));
    },
    [navigate, update]
  );

  // Going "to the library" from the library (or from a detail sheet over it)
  // changes no path: the sheet stays up, as the old modal did.
  const setActiveView = useCallback(
    (view) => {
      const here = latest.current;
      if (view === "profile") {
        if (viewForPath(here.pathname) !== "profile") navigate({ pathname: SETTINGS_PATH, search: here.search });
        return;
      }
      if (viewForPath(here.pathname) === "profile") navigate({ pathname: LIBRARY_PATH, search: here.search });
    },
    [navigate]
  );

  const activeView = viewForPath(location.pathname);
  const shelves = lib.state.filter.shelves;
  const shelfFilter = shelves.length === 0 ? "all" : shelves.length === 1 ? shelves[0] : null;

  const value = useMemo(
    () => ({
      lib,
      searchQuery: searchDraft,
      setSearchQuery,
      showShelf,
      shelfFilter,
      activeView,
      setActiveView,
      search: location.search,
    }),
    [lib, searchDraft, setSearchQuery, showShelf, shelfFilter, activeView, setActiveView, location.search]
  );

  return <LibraryParamsContext.Provider value={value}>{children}</LibraryParamsContext.Provider>;
}

export function useLibraryParams() {
  const ctx = useContext(LibraryParamsContext);
  if (!ctx) throw new Error("useLibraryParams needs a LibraryParamsProvider");
  return ctx;
}
