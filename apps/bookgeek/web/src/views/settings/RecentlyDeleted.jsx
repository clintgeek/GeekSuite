/**
 * Settings → Recently deleted (S-D5, 2026-11-15). A delete moves a book here
 * for 30 days, with every reader's shelf, rating and progress intact; Restore
 * puts it back, Delete forever ends it now. Shared, like the library: what
 * one person in the house deleted, the other can restore.
 *
 * Same grammar as the rest of Settings: an overline section label, body2
 * help text, 44px targets. Rows are the list row's cover + text, with the
 * actions on the right (they wrap under the text on a narrow phone).
 */
import React, { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DeleteForeverOutlinedIcon from "@mui/icons-material/DeleteForeverOutlined";
import { GeekDialog, GeekErrorState } from "@geeksuite/ui";
import BookCover from "../../components/BookCover";
import { getCoverUrl } from "../../utils/bookDisplay";
import { useRecentlyDeleted } from "../../hooks/useRecentlyDeleted";

function dayLabel(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function RecentlyDeletedList({ books, loading, error, busyId, reload, restore, deleteForever }) {
  const [confirming, setConfirming] = useState(null);

  let body;
  if (error) {
    body = (
      <GeekErrorState compact align="start" title="Could not load Recently deleted" error={error} onRetry={reload} />
    );
  } else if (loading && books.length === 0) {
    body = (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Loading…
      </Typography>
    );
  } else if (books.length === 0) {
    body = (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Nothing deleted in the last 30 days.
      </Typography>
    );
  } else {
    body = (
      <List disablePadding aria-label="Recently deleted books">
        {books.map((book) => {
          const busy = busyId === book.id;
          const author = Array.isArray(book.authors) ? book.authors.filter(Boolean).join(", ") : "";
          const purge = dayLabel(book.purgeAt);
          return (
            <ListItem
              key={book.id}
              disableGutters
              sx={{ py: 1.5, alignItems: "flex-start", gap: 3, flexWrap: { xs: "wrap", sm: "nowrap" } }}
            >
              <Box sx={{ display: "flex", gap: 3, flex: 1, minWidth: 0 }}>
                <BookCover book={book} src={getCoverUrl(book)} size="row" sx={{ width: 40, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body1" sx={{ fontWeight: 500 }} noWrap>
                    {book.title || "Untitled"}
                  </Typography>
                  {author ? (
                    <Typography variant="body2" sx={{ color: "text.secondary" }} noWrap>
                      {author}
                    </Typography>
                  ) : null}
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                    Deleted {dayLabel(book.deletedAt) || "recently"}
                    {purge ? ` · gone for good ${ purge }` : ""}
                    {book.deleteFilesOnPurge ? " · files too" : ""}
                  </Typography>
                </Box>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: { xs: "52px", sm: 0 }, flexShrink: 0 }}>
                <Button
                  variant="outlined"
                  onClick={() => restore(book)}
                  disabled={busy}
                  aria-label={`Restore “${ book.title || "Untitled" }”`}
                  sx={{ minHeight: 44 }}
                >
                  Restore
                </Button>
                <IconButton
                  aria-label={`Delete “${ book.title || "Untitled" }” forever`}
                  title="Delete forever"
                  onClick={() => setConfirming(book)}
                  disabled={busy}
                  sx={{ width: 44, height: 44 }}
                >
                  <DeleteForeverOutlinedIcon fontSize="small" />
                </IconButton>
              </Stack>
            </ListItem>
          );
        })}
      </List>
    );
  }

  const confirmBusy = Boolean(confirming) && busyId === confirming.id;
  const closeConfirm = () => {
    if (!confirmBusy) setConfirming(null);
  };

  return (
    <Stack spacing={1.5}>
      {body}
      <GeekDialog
        open={Boolean(confirming)}
        onClose={closeConfirm}
        title="Delete forever?"
        mode="window"
        maxWidth="xs"
        disableClose={confirmBusy}
        keepSecondaryOnMobile
        primaryAction={
          <Button
            variant="contained"
            color="error"
            disabled={confirmBusy}
            onClick={async () => {
              if (await deleteForever(confirming)) setConfirming(null);
            }}
          >
            {confirmBusy ? "Deleting…" : "Delete forever"}
          </Button>
        }
        secondaryAction={
          <Button onClick={closeConfirm} disabled={confirmBusy}>
            Cancel
          </Button>
        }
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          “{confirming?.title || "Untitled"}” and everyone’s shelf, rating and progress for it
          {confirming?.deleteFilesOnPurge ? ", and its files," : ""} will be deleted. This
          cannot be undone.
        </Typography>
      </GeekDialog>
    </Stack>
  );
}

export default function RecentlyDeleted() {
  const trash = useRecentlyDeleted();
  return (
    <Stack spacing={1.5}>
      <Typography
        component="h3"
        variant="overline"
        sx={{ display: "block", color: "text.muted", letterSpacing: "0.08em", fontWeight: 600 }}
      >
        Recently deleted
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Deleted books stay here for 30 days, with everyone’s shelves, ratings and progress. Restore
        puts one back as it was.
      </Typography>
      <RecentlyDeletedList {...trash} />
    </Stack>
  );
}
