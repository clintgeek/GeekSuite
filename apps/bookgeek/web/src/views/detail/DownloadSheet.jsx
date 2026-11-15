/**
 * DownloadSheet — the old `downloadOpen` dropdown as a sheet.
 *
 * The three ebook formats, with the same size/"Not available"/"Converting…"
 * labels and the same `handleDownload(book, format)` call, which converts
 * server-side when the format is missing.
 *
 * Comics (2026-11-15): a comic archive or a PDF the book already has is
 * listed first and downloads as it is. A book with no ebook file shows only
 * those rows (utils/comic.js `downloadRows`).
 */
import React from "react";
import { List, ListItem, ListItemButton, ListItemText, Typography } from "@mui/material";
import { GeekSheet } from "@geeksuite/ui";
import { formatBytes } from "./bookFacts";
import { downloadRows } from "../../utils/comic";

export default function DownloadSheet({ open, onClose, book, convertingFormat, handleDownload }) {
  const rows = downloadRows(book);
  const converts = rows.some((row) => !row.asIs);
  return (
    <GeekSheet
      open={open}
      onClose={onClose}
      title={converts ? "Download / Convert" : "Download"}
      description={
        converts
          ? "Missing formats are converted on the server."
          : "Comic files download as they are."
      }
      maxWidth="xs"
     
    >
      <List disablePadding sx={{ pb: 1 }}>
        {rows.map(({ format, file: existing }) => {
          let sizeLabel;
          if (convertingFormat === format) sizeLabel = "Converting…";
          else if (existing) sizeLabel = formatBytes(existing.size);
          else sizeLabel = "Not available";

          return (
            // In a ListItem: a bare ListItemButton is a div[role=button] straight
            // inside the <ul>, which axe rejects (found by the harness, 2026-11-15).
            <ListItem key={format} disablePadding>
            <ListItemButton
              disabled={Boolean(convertingFormat)}
              onClick={() => handleDownload(book, format)}
              sx={{ minHeight: 44, borderRadius: 1, width: "100%" }}
            >
              <ListItemText
                primary={format.toUpperCase()}
                primaryTypographyProps={{ variant: "body2", fontWeight: 500 }}
              />
              <Typography variant="caption" sx={{ color: "text.muted" }}>
                {sizeLabel}
              </Typography>
            </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </GeekSheet>
  );
}
