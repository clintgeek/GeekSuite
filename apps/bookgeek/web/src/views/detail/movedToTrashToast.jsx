/**
 * The toast after a delete (S-D5, 2026-11-15): the book is in Recently
 * deleted, not gone, so the toast says so and offers Undo — the same restore
 * Settings → Recently deleted does. Long enough to reach on a phone.
 */
import React from "react";
import { Button } from "@mui/material";

export const MOVED_TO_TRASH_TOAST_MS = 10000;

/**
 * @param notify  useToast().notify
 * @param title   the book's title
 * @param undo    restores it; reports its own outcome through the toast
 */
export function notifyMovedToTrash(notify, title, undo) {
  return notify(`“${ title || "Untitled" }” moved to Recently deleted`, {
    tone: "info",
    duration: MOVED_TO_TRASH_TOAST_MS,
    action: (
      <Button size="small" color="inherit" onClick={undo} sx={{ minHeight: 44, textTransform: "none", fontWeight: 600 }}>
        Undo
      </Button>
    ),
  });
}
