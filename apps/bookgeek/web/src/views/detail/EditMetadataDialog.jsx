/**
 * EditMetadataDialog — the old in-place 11px edit mode as a real form.
 *
 * Every field `beginEditForSelectedBook` puts in `editDraft` has a control
 * here, all of them 16px `TextField`s (no iOS zoom). Save and Cancel call the
 * same App handlers; the ✕ cancels too, and is suppressed while saving.
 *
 * "Draft description & tags" (AI idea #4, behind the Library assistant switch)
 * fills the Description and Tags fields from `draftBookMetadata` and marks them
 * AI-drafted. It writes nothing: the draft lands in the form, the user edits
 * it, and Save goes through the same `updateBook` mutation a hand-typed edit
 * does.
 */
import React from "react";
import { Box, Button, Chip, Rating, TextField, Typography } from "@mui/material";
import { AutoAwesome as SparkleIcon } from "@mui/icons-material";
import { GeekDialog } from "@geeksuite/ui";
import { metadataDraftProvenanceLine } from "../../utils/libraryAssistant";

export default function EditMetadataDialog({
  open,
  editDraft,
  editError,
  editSaving,
  setEditDraft,
  handleSaveEditForSelectedBook,
  cancelEditForSelectedBook,
  // The library assistant. Absent (or `false`) means the button is not shown at
  // all — the switch in Settings is the only way it appears.
  metadataDraftEnabled = false,
  metadataDraftLoading = false,
  metadataDraftError = null,
  metadataDraftProvenance = null,
  handleDraftMetadata,
}) {
  const draft = editDraft || {};
  const setField = (key) => (event) =>
    setEditDraft((prev) => ({ ...(prev || {}), [key]: event.target.value }));

  const provenanceLine = metadataDraftProvenanceLine(metadataDraftProvenance);

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

        {metadataDraftEnabled ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<SparkleIcon />}
              onClick={handleDraftMetadata}
              disabled={metadataDraftLoading || editSaving}
              sx={{ minHeight: 44 }}
            >
              {metadataDraftLoading ? "Drafting…" : "Draft description & tags"}
            </Button>
            {metadataDraftProvenance ? (
              <Chip
                icon={<SparkleIcon />}
                label="AI-drafted"
                size="small"
                variant="outlined"
                sx={{ height: 22, "& .MuiChip-label": { fontSize: "0.75rem", px: 0.75 } }}
              />
            ) : null}
            {provenanceLine ? (
              <Typography variant="caption" sx={{ color: "text.muted", width: "100%" }}>
                {provenanceLine}
              </Typography>
            ) : null}
            {metadataDraftError ? (
              <Typography role="status" variant="caption" sx={{ color: "error.main", width: "100%" }}>
                {metadataDraftError}
              </Typography>
            ) : null}
          </Box>
        ) : null}

        <TextField
          label="Description"
          value={draft.description || ""}
          onChange={setField("description")}
          fullWidth
          multiline
          minRows={3}
        />
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
            // 44px stars: each star is a tap target (harness scene 08-edit-metadata-draft)
            sx={{ fontSize: 44 }}
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
