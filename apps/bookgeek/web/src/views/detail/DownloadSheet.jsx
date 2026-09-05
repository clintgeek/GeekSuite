/**
 * DownloadSheet — the old `downloadOpen` dropdown as a sheet.
 *
 * Same three formats, the same size/"Not available"/"Converting…" labels, and
 * the same `handleDownload(book, format)` call, which converts server-side
 * when the format is missing.
 */
import React from "react";
import { List, ListItemButton, ListItemText, Typography } from "@mui/material";
import { GeekSheet } from "@geeksuite/ui";
import { formatBytes } from "./bookFacts";

const FORMATS = ["epub", "azw3", "mobi"];

export default function DownloadSheet({ open, onClose, book, convertingFormat, handleDownload }) {
  return (
    <GeekSheet
      open={open}
      onClose={onClose}
      title="Download / Convert"
      description="Missing formats are converted on the server."
      maxWidth="xs"
     
    >
      <List disablePadding sx={{ pb: 1 }}>
        {FORMATS.map((format) => {
          const existing = (book.files || []).find(
            (f) => String(f.format || "").toLowerCase() === format
          );

          let sizeLabel;
          if (convertingFormat === format) sizeLabel = "Converting…";
          else if (existing) sizeLabel = formatBytes(existing.size);
          else sizeLabel = "Not available";

          return (
            <ListItemButton
              key={format}
              disabled={Boolean(convertingFormat)}
              onClick={() => handleDownload(book, format)}
              sx={{ minHeight: 44, borderRadius: 1 }}
            >
              <ListItemText
                primary={format.toUpperCase()}
                primaryTypographyProps={{ variant: "body2", fontWeight: 500 }}
              />
              <Typography variant="caption" sx={{ color: "text.muted" }}>
                {sizeLabel}
              </Typography>
            </ListItemButton>
          );
        })}
      </List>
    </GeekSheet>
  );
}
