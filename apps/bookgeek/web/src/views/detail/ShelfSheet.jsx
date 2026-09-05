/**
 * ShelfSheet — the shelf picker that replaced the 11px native `<select>`.
 *
 * 44px rows, a shelf-colored dot per row, a check on the current shelf. The
 * first row clears the shelf; `handleUpdateShelf` in `App.jsx` is the same
 * mutation the old select fired.
 */
import React from "react";
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import { Check as CheckIcon } from "@mui/icons-material";
import { GeekSheet } from "@geeksuite/ui";
import { useTheme } from "@mui/material/styles";
import { bookId, shelfColor } from "./bookFacts";

export default function ShelfSheet({ open, onClose, book, shelves, shelfSavingId, handleUpdateShelf }) {
  const theme = useTheme();
  const saving = Boolean(shelfSavingId) && shelfSavingId === bookId(book);
  const options = [
    { id: "", label: "No shelf" },
    ...(Array.isArray(shelves) ? shelves.filter((s) => s.id !== "all") : []),
  ];

  return (
    <GeekSheet open={open} onClose={onClose} title="Shelf" maxWidth="xs">
      <List disablePadding sx={{ pb: 1 }}>
        {options.map((shelf) => {
          const selected = (book.shelf || "") === shelf.id;
          return (
            <ListItemButton
              key={shelf.id || "none"}
              disabled={saving}
              selected={selected}
              onClick={() => {
                handleUpdateShelf(book, shelf.id);
                onClose();
              }}
              sx={{ minHeight: 44, borderRadius: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    bgcolor: shelf.id ? shelfColor(theme, shelf.id) : "transparent",
                    border: (t) => (shelf.id ? "none" : `1px solid ${t.palette.divider}`),
                  }}
                />
              </ListItemIcon>
              <ListItemText
                primary={shelf.label}
                primaryTypographyProps={{ variant: "body2", fontWeight: selected ? 600 : 400 }}
              />
              {selected ? <CheckIcon fontSize="small" sx={{ color: "primary.main" }} /> : null}
            </ListItemButton>
          );
        })}
      </List>
    </GeekSheet>
  );
}
