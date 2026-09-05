/**
 * BookGeek "Add book" dialog — the MUI form behind the top bar's add action.
 *
 * Lifted verbatim out of `App.jsx`; `open` and every field still live in `App`.
 */
import React from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, TextField, Typography } from "@mui/material";

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
  return (
    <Dialog
      open={addBookOpen}
      onClose={() => !addBookLoading && setAddBookOpen(false)}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Add book</DialogTitle>
      <form onSubmit={handleCreateBook}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
              {shelves.filter((s) => s.id !== "all").map((s) => (
                <MenuItem key={s.id} value={s.id}>{s.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
              Book file (optional)
            </Typography>
            <input
              type="file"
              accept=".epub,.mobi,.azw3,.pdf,.fb2,.rtf,.txt,.html"
              onChange={(e) => setAddBookFile(e.target.files?.[0] || null)}
              className="w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-sky-500/10 file:px-3 file:py-1 file:text-xs file:text-sky-500"
            />
          </Box>
          {addBookError && (
            <Typography color="error" variant="body2">
              {addBookError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            type="button"
            onClick={() => setAddBookOpen(false)}
            disabled={addBookLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={addBookLoading || !addBookTitle.trim()}
          >
            {addBookLoading ? "Creating…" : "Create"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
