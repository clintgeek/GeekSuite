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
import Typography from "@mui/material/Typography";
import { GeekDialog } from "@geeksuite/ui";

const FORM_ID = "add-book-form";

export default function AddBookDialog({
  addBookAuthors,
  addBookError,
  addBookIsbn,
  addBookLoading,
  addBookOpen,
  addBookShelf,
  addBookTitle,
  handleCreateBook,
  setAddBookAuthors,
  setAddBookFile,
  setAddBookIsbn,
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
          disabled={addBookLoading || !addBookTitle.trim()}
        >
          {addBookLoading ? "Creating…" : "Create"}
        </Button>
      }
      secondaryAction={
        <Button type="button" onClick={() => setAddBookOpen(false)} disabled={addBookLoading}>
          Cancel
        </Button>
      }
    >
      <Box component="form" id={FORM_ID} onSubmit={handleCreateBook}>
        <Stack spacing={2}>
          <TextField
            label="Title"
            value={addBookTitle}
            onChange={(e) => setAddBookTitle(e.target.value)}
            required
            autoFocus
            fullWidth
          />
          <TextField
            label="Authors"
            value={addBookAuthors}
            onChange={(e) => setAddBookAuthors(e.target.value)}
            placeholder="Jane Doe, John Smith"
            helperText="Comma-separated"
            fullWidth
          />
          <TextField
            label="ISBN"
            value={addBookIsbn}
            onChange={(e) => setAddBookIsbn(e.target.value)}
            fullWidth
          />
          <FormControl fullWidth>
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
          <Box>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>
              Book file (optional)
            </Typography>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
              <Button variant="outlined" component="label">
                Choose file…
                <input
                  type="file"
                  accept=".epub,.mobi,.azw3,.pdf,.fb2,.rtf,.txt,.html"
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
          {addBookError ? (
            <Alert severity="error" variant="standard">
              {addBookError}
            </Alert>
          ) : null}
        </Stack>
      </Box>
    </GeekDialog>
  );
}
