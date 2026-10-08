/**
 * LastReadRow — the detail page's "Last read" (`dateFinished`), editable in
 * place. Shown even when empty ("Set date"), because setting it is the point.
 *
 * Tap → a native date input (no picker library), Save, Clear and Cancel, all
 * 44px. The day picked is stored as UTC midnight (utils/lastRead.js) so
 * `formatReadingDate` shows the same day everywhere. Editing spans both
 * columns of the Details grid so the controls never squeeze on a phone.
 */
import React, { useEffect, useRef, useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import { isoToCalendarDay } from "../../utils/lastRead";
import { formatReadingDate } from "./bookFacts";

const dtSx = {
  display: "block",
  color: "text.muted",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const BUTTON_SX = { minHeight: 44, textTransform: "none" };

export default function LastReadRow({ book, editing, saving = false, error = null, onEdit, onCancel, onSave }) {
  const shown = formatReadingDate(book.dateFinished);
  const [draft, setDraft] = useState(() => isoToCalendarDay(book.dateFinished));
  const fieldRef = useRef(null);

  // Each time the editor opens it starts from the stored date, and comes into
  // view — "Change date" on the Moved-to-Read toast opens it from afar.
  useEffect(() => {
    if (!editing) return;
    setDraft(isoToCalendarDay(book.dateFinished));
    fieldRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    fieldRef.current?.focus?.();
    // Only on open: a save that lands while open must not reset the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!editing) {
    return (
      <Box component="div">
        <Typography component="dt" variant="caption" sx={dtSx}>
          Last read
        </Typography>
        <Box component="dd" sx={{ m: 0 }}>
          <Button
            variant="text"
            onClick={onEdit}
            aria-label={shown ? `Last read ${ shown }. Change date` : "Set last read date"}
            sx={{
              ...BUTTON_SX,
              px: 0.5,
              ml: -0.5,
              justifyContent: "flex-start",
              fontSize: "0.875rem",
              fontWeight: shown ? 400 : 600,
              color: shown ? "text.primary" : "primary.main",
              textDecoration: "underline",
              textDecorationStyle: "dotted",
              textUnderlineOffset: "3px",
            }}
          >
            {shown || "Set date"}
          </Button>
        </Box>
      </Box>
    );
  }

  const save = (event) => {
    event?.preventDefault?.();
    onSave(draft);
  };

  return (
    <Box component="div" sx={{ gridColumn: "1 / -1" }}>
      <Typography component="dt" variant="caption" sx={dtSx}>
        Last read
      </Typography>
      <Box component="dd" sx={{ m: 0, mt: 0.5 }}>
        <Box component="form" onSubmit={save} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
          <TextField
            type="date"
            size="small"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            inputRef={fieldRef}
            inputProps={{ "aria-label": "Last read date" }}
            disabled={saving}
            sx={{ flex: "1 1 160px", "& .MuiInputBase-input": { minHeight: 44, boxSizing: "border-box", fontSize: 16 } }}
          />
          <Button type="submit" variant="contained" disabled={saving} sx={BUTTON_SX}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {book.dateFinished ? (
            <Button variant="outlined" disabled={saving} onClick={() => onSave("")} sx={BUTTON_SX}>
              Clear
            </Button>
          ) : null}
          <Button variant="text" disabled={saving} onClick={onCancel} sx={BUTTON_SX}>
            Cancel
          </Button>
        </Box>
        {error ? (
          <Typography role="alert" variant="caption" sx={{ display: "block", mt: 0.5, color: "error.main" }}>
            {error}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
