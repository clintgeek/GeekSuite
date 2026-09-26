/**
 * The signed-in session's shared state — what more than one route reads:
 *
 *   - the user and sign-out;
 *   - the profile and the shelf list built from it (hooks/useProfile.js);
 *   - the shelf counts (`shelves` query, in the Apollo cache);
 *   - app preferences: the default shelf and the library-assistant switch;
 *   - the device basket and select mode (library + detail + the FAB);
 *   - the Add-book dialog (top bar + FAB, over any route);
 *   - the rating save, one per session so its out-of-order guard is shared.
 *
 * Everything else belongs to a route: the book list to the library
 * (hooks/useLibrary.js), the sheet's state to `/book/:id`
 * (hooks/useBookDetail.js), the import jobs and forms to Settings
 * (hooks/useSettings.js). The provider unmounts on sign-out, so every piece of
 * session state resets with it.
 */
import React, { createContext, useContext, useMemo } from "react";
import { useQuery } from "@apollo/client";
import { GET_SHELVES } from "../graphql/queries.js";
import { useAddBook } from "./useAddBook";
import { useAppSettings } from "./useAppSettings";
import { useRateBook } from "./useBookActions";
import { useDeviceBasket } from "./useDeviceBasket";
import { useLibraryParams } from "./useLibraryParams";
import { useProfile } from "./useProfile";
import { evictWhatNext } from "./useWhatNext";

const BookGeekContext = createContext(null);

export function BookGeekProvider({ user, onSignOut, children }) {
  const params = useLibraryParams();
  const profile = useProfile();
  const { data: shelvesData, client } = useQuery(GET_SHELVES, { fetchPolicy: "cache-and-network" });
  const settings = useAppSettings({ params });
  const basket = useDeviceBasket();
  const addBook = useAddBook({ params });
  const rateBook = useRateBook();

  const toggleLibraryAssistant = settings.handleToggleLibraryAssistant;
  const value = useMemo(
    () => ({
      user,
      onSignOut,
      ...profile,
      shelfSummary: shelvesData?.shelves ?? null,
      settings: {
        ...settings,
        // Switching the assistant off forgets the strip, so switching it back
        // on asks again (once), as before.
        handleToggleLibraryAssistant: async (next) => {
          const saved = await toggleLibraryAssistant(next);
          if (!saved) evictWhatNext(client.cache);
        },
      },
      basket,
      addBook,
      rateBook,
    }),
    [user, onSignOut, profile, shelvesData, settings, toggleLibraryAssistant, client, basket, addBook, rateBook]
  );

  return <BookGeekContext.Provider value={value}>{children}</BookGeekContext.Provider>;
}

export function useBookGeek() {
  const ctx = useContext(BookGeekContext);
  if (!ctx) throw new Error("useBookGeek needs a BookGeekProvider");
  return ctx;
}
