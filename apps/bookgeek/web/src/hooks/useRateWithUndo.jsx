/**
 * Rate a book in one tap, then offer Undo in a toast — the library grid's
 * behaviour (LibraryView), shared with the book's own page (review
 * 2026-11-18 #6). Under the suite rule a rating can be undone, so it acts at
 * once and the toast carries Undo; a failed save has already rolled back in
 * the cache (utils/rateBook.js), and saying so is the caller's job — here.
 */
import React, { useCallback } from "react";
import { Button } from "@mui/material";
import { useToast } from "@geeksuite/ui";
import { ratingLabelFor } from "@geeksuite/collection";

export function useRateWithUndo(rateBook) {
  const { notify } = useToast();
  return useCallback(
    async (book, rating) => {
      if (!rateBook) return;
      const previous = typeof book.rating === "number" && book.rating > 0 ? book.rating : null;
      const title = book.title || "this book";
      const ok = await rateBook(book, rating);
      if (!ok) {
        notify(`Couldn't save the rating for ${title}.`, { tone: "error" });
        return;
      }
      const label = ratingLabelFor(rating)?.label;
      notify(`${rating}★${label ? ` ${label}` : ""} · ${title}`, {
        tone: "success",
        action: (
          <Button
            size="small"
            color="inherit"
            onClick={() => rateBook({ ...book, rating }, previous)}
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            Undo
          </Button>
        ),
      });
    },
    [rateBook, notify]
  );
}
