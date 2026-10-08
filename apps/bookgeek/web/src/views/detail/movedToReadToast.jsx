/**
 * The toast after a book moves to the Read shelf (Chef, 2026-10-08).
 *
 *   - It had no last-read date: `updateShelf` already set it to today in the
 *     same mutation, so this says so — "Moved to Read · Last read set to
 *     today" — with Undo (shelf AND date back) and Change date.
 *   - It already had one: that's a re-read, and overwriting it silently would
 *     lose the old date. The shelf moved; the date didn't. "Moved to Read ·
 *     Last read Mar 2024" with Set to today, and Undo for the move.
 */
import React from "react";
import { Box, Button } from "@mui/material";
import { formatReadingDate } from "./bookFacts";

/**
 * Longer than the suite's 4s: this toast asks a question (Set to today?) and
 * offers two actions, read on a phone, often with the sheet still up.
 */
export const MOVED_TO_READ_TOAST_MS = 10000;

const ACTION_SX = { minHeight: 44, textTransform: "none", fontWeight: 600 };

function Actions({ actions }) {
  return (
    <Box sx={{ display: "flex", gap: 0.5 }}>
      {actions.map(([label, onClick]) => (
        <Button key={label} size="small" color="inherit" onClick={onClick} sx={ACTION_SX}>
          {label}
        </Button>
      ))}
    </Box>
  );
}

/**
 * @param notify      useToast().notify
 * @param before      `{ shelf, dateFinished }` as the book was before the move
 * @param handlers    `{ undo, changeDate, setToday }` — each returns nothing
 */
export function notifyMovedToRead(notify, before, { undo, changeDate, setToday }) {
  if (!before.dateFinished) {
    return notify("Moved to Read · Last read set to today", {
      tone: "success",
      duration: MOVED_TO_READ_TOAST_MS,
      action: <Actions actions={[["Undo", undo], ["Change date", changeDate]]} />,
    });
  }
  const shown = formatReadingDate(before.dateFinished, { month: "short", year: "numeric" });
  return notify(`Moved to Read · Last read ${ shown }`, {
    tone: "info",
    duration: MOVED_TO_READ_TOAST_MS,
    action: <Actions actions={[["Set to today", setToday], ["Undo", undo]]} />,
  });
}
