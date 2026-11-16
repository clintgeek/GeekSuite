/**
 * BookGeek "Add book" dialog — the MUI form behind the top bar's add action.
 *
 * `GeekDialog` (DOCS/MOBILE_UI_PLAN.md §3.5): full-screen below `sm` with
 * "Create" in the header, submitting the form by `form` id so the header
 * button works from outside the scrolling body. `open` and every field still
 * live in `App`.
 */
import React, { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { GeekDialog } from "@geeksuite/ui";
import { BOOK_FILE_ACCEPT } from "../utils/comic";

const FORM_ID = "add-book-form";

export default function AddBookDialog({
  addBookAuthors,
  addBookCreatedId = null,
  addBookError,
  addBookIsbn,
  addBookKind = "",
  addBookLoading,
  addBookOpen,
  addBookShelf,
  addBookTitle,
  handleCreateBook,
  openCreatedBook,
  setAddBookAuthors,
  setAddBookFile,
  setAddBookIsbn,
  setAddBookKind,
  setAddBookOpen,
  setAddBookShelf,
  setAddBookTitle,
  shelves,
}) {
  // `addBookFile` (the File object) isn't passed down — only its setter is —
  // so the chosen filename is tracked locally purely for display. Resets on
  // every fresh open, matching the old native `<input type=file>`'s reset on
  // remount (this component itself never unmounts; the dialog body does).
  const [fileName, setFileName] = useState("");
  useEffect(() => {
    if (addBookOpen) setFileName("");
  }, [addBookOpen]);

  // The book exists once `createBook` has answered; after that a failed tag
  // or upload is retried on the SAME book (useAddBook), so the catalog fields
  // are locked and the buttons say what they will do.
  const created = Boolean(addBookCreatedId);
  const primaryLabel = addBookLoading
    ? (created ? "Retrying…" : "Creating…")
    : (created ? "Retry" : "Create");

  return (
    <GeekDialog
      open={addBookOpen}
      onClose={() => setAddBookOpen(false)}
      disableClose={addBookLoading}
      title="Add book"
      primaryAction={
        <Button
          type="submit"
          form={FORM_ID}
          variant="contained"
          disabled={addBookLoading || (!created && !addBookTitle.trim())}
        >
          {primaryLabel}
        </Button>
      }
      secondaryAction={
        created ? (
          <Button type="button" onClick={() => openCreatedBook?.()} disabled={addBookLoading}>
            Open book
          </Button>
        ) : (
          <Button type="button" onClick={() => setAddBookOpen(false)} disabled={addBookLoading}>
            Cancel
          </Button>
        )
      }
    >
      <Box component="form" id={FORM_ID} onSubmit={handleCreateBook}>
        <Stack spacing={2}>
          <TextField
            label="Title"
            disabled={created}
            value={addBookTitle}
            onChange={(e) => setAddBookTitle(e.target.value)}
            required
            autoFocus
            fullWidth
          />
          <TextField
            label="Authors"
            disabled={created}
            value={addBookAuthors}
            onChange={(e) => setAddBookAuthors(e.target.value)}
            placeholder="Jane Doe, John Smith"
            helperText="Comma-separated"
            fullWidth
          />
          <TextField
            label="ISBN"
            disabled={created}
            value={addBookIsbn}
            onChange={(e) => setAddBookIsbn(e.target.value)}
            fullWidth
          />
          <FormControl fullWidth disabled={created}>
            <InputLabel id="add-book-shelf-label">Shelf</InputLabel>
            <Select
              labelId="add-book-shelf-label"
              value={addBookShelf}
              onChange={(e) => setAddBookShelf(e.target.value)}
              label="Shelf"
            >
              {shelves
                .filter((s) => s.id !== "all")
                .map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.label}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
          {/* Kind on the left, the file on the right; they stack on a phone.
              Manga / Comic is asked here because an EPUB or a PDF does not say
              what it is: the choice writes the tag that makes it a comic. */}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 2, sm: 3 }} alignItems="flex-start">
            <Box>
              <Typography id="add-book-kind" variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>
                Manga or comic?
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={addBookKind || null}
                disabled={created}
                onChange={(_e, value) => setAddBookKind?.(value || "")}
                aria-labelledby="add-book-kind"
              >
                <ToggleButton value="manga" sx={{ minHeight: 44, px: 2, textTransform: "none" }}>
                  Manga
                </ToggleButton>
                <ToggleButton value="comic" sx={{ minHeight: 44, px: 2, textTransform: "none" }}>
                  Comic
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>
                Book file (optional)
              </Typography>
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                <Button variant="outlined" component="label" sx={{ minHeight: 44 }}>
                  Choose file…
                  <input
                    type="file"
                    accept={BOOK_FILE_ACCEPT}
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setAddBookFile(file);
                      setFileName(file?.name || "");
                    }}
                  />
                </Button>
                {fileName ? (
                  <Typography variant="body2" sx={{ color: "text.secondary" }} noWrap>
                    {fileName}
                  </Typography>
                ) : null}
              </Stack>
            </Box>
          </Stack>
          {addBookError ? (
            <Alert severity={created ? "warning" : "error"} variant="standard">
              {addBookError}
            </Alert>
          ) : null}
        </Stack>
      </Box>
    </GeekDialog>
  );
}
