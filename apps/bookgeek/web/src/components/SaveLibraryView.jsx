/**
 * "Save view" for the library: the shared SaveViewDialog
 * (`@geeksuite/collection`) bound to `saveLibraryFilter` through
 * hooks/useSavedViews. It saves the WHOLE BookFilterInput plus the sort; the
 * view then lives in the sidebar under the shelves.
 */
import React from "react";
import { SaveViewDialog } from "@geeksuite/collection";
import { useSavedViews } from "../hooks/useSavedViews";
import { SORT_LABELS } from "../utils/libraryFilter";

const savedMessage = (name) => `Saved “${ name }”. It's in the sidebar under your shelves.`;

export default function SaveLibraryView({ open, onClose, filterInput, sort, dir, chips = [] }) {
  const { save } = useSavedViews();
  return (
    <SaveViewDialog
      open={open}
      onClose={onClose}
      onSave={(name) => save(name, { filterInput, sort, dir })}
      chips={chips}
      fallbackName={SORT_LABELS[sort] ?? "My view"}
      savedMessage={savedMessage}
    />
  );
}
