/**
 * EditMetadataDialog — the old in-place 11px edit mode as a real form.
 *
 * Every field `beginEditForSelectedBook` puts in `editDraft` has a control
 * here, all of them 16px `TextField`s (no iOS zoom). Save and Cancel call the
 * same App handlers; the ✕ cancels too, and is suppressed while saving.
 */
import React from "react";
import { Box, Button, Rating, TextField, Typography } from "@mui/material";
import { GeekDialog } from "@geeksuite/ui";

export default function EditMetadataDialog({
  open,
  editDraft,
  editError,
  editSaving,
  setEditDraft,
  handleSaveEditForSelectedBook,
  cancelEditForSelectedBook,
}) {
  const draft = editDraft || {};
  const setField = (key) => (event) =>
    setEditDraft((prev) => ({ ...(prev || {}), [key]: event.target.value }));

  return (
    <GeekDialog
      open={open}
      onClose={cancelEditForSelectedBook}
      title="Edit metadata"
      disableClose={editSaving}
      maxWidth="sm"
      primaryAction={
        <Button variant="contained" onClick={handleSaveEditForSelectedBook} disabled={editSaving}>
          {editSaving ? "Saving…" : "Save"}
        </Button>
      }
      secondaryAction={
        <Button onClick={cancelEditForSelectedBook} disabled={editSaving}>
          Cancel
        </Button>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        {editError ? (
          <Typography variant="body2" sx={{ color: "error.main" }}>
            {editError}
          </Typography>
        ) : null}

        <TextField label="Title" value={draft.title || ""} onChange={setField("title")} fullWidth />
        <TextField
          label="Authors"
          helperText="Comma-separated"
          value={draft.authors || ""}
          onChange={setField("authors")}
          fullWidth
        />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          <TextField label="Publisher" value={draft.publisher || ""} onChange={setField("publisher")} />
          <TextField
            label="Published"
            type="date"
            value={draft.publishedDate || ""}
            onChange={setField("publishedDate")}
            InputLabelProps={{ shrink: true }}
          />
          <TextField label="Language" value={draft.language || ""} onChange={setField("language")} />
          <TextField label="Goodreads ID" value={draft.goodreadsId || ""} onChange={setField("goodreadsId")} />
          <TextField label="ISBN" value={draft.isbn || ""} onChange={setField("isbn")} />
          <TextField label="ISBN13" value={draft.isbn13 || ""} onChange={setField("isbn13")} />
        </Box>
        <TextField
          label="Tags"
          helperText="Comma-separated"
          value={draft.tags || ""}
          onChange={setField("tags")}
          fullWidth
        />

        <Box>
          <Typography variant="caption" component="p" sx={{ color: "text.muted", mb: 0.5 }}>
            Rating
          </Typography>
          <Rating
            name="book-rating"
            precision={0.5}
            value={draft.rating === "" || draft.rating == null ? null : Number(draft.rating)}
            onChange={(event, next) =>
              setEditDraft((prev) => ({
                ...(prev || {}),
                rating: next == null ? "" : String(next),
              }))
            }
            sx={{ fontSize: 32 }}
          />
        </Box>

        <TextField
          label="Review"
          value={draft.review || ""}
          onChange={setField("review")}
          fullWidth
          multiline
          minRows={4}
        />
      </Box>
    </GeekDialog>
  );
}
