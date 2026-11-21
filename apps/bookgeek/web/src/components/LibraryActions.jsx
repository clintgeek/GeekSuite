/**
 * The library's ⋯ menu, beside the sort in the header (`@geeksuite/collection`
 * LibraryHeader `actions`): what the pre-C2 filter sheet kept at its foot —
 * export what the filters match and select books for the device basket. On a phone it also carries the covers/list switch, which
 * would not fit on the header row there beside Filters, Sort and Save.
 */
import React, { useState } from "react";
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import {
  CheckBoxOutlined as SelectIcon,
  FileDownloadOutlined as ExportIcon,
  GridView as GridIcon,
  MoreHoriz as MoreIcon,
  ViewList as ListIcon,
} from "@mui/icons-material";
import { signBoardShadow } from "../theme/theme";

// An aisle sign like Filters and Sort beside it (review 2026-11-18 #5).
const roundIconSx = {
  width: 44,
  height: 44,
  borderRadius: "4px",
  bgcolor: "sign.board",
  color: "sign.ink",
  border: (t) => `1px solid ${t.palette.sign.edge}`,
  boxShadow: (t) => signBoardShadow(t.palette.sign.edge),
  "&:hover": { bgcolor: "sign.edge" },
};

export default function LibraryActions({
  view,
  onToggleView,
  onExportCsv,
  exportingCsv = false,
  onSelectBooks,
}) {
  const [anchor, setAnchor] = useState(null);
  const close = () => setAnchor(null);
  const run = (fn) => () => {
    close();
    fn?.();
  };

  return (
    <>
      <IconButton
        aria-label="Library actions"
        aria-haspopup="menu"
        aria-expanded={anchor ? "true" : "false"}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={roundIconSx}
      >
        <MoreIcon sx={{ fontSize: 20 }} />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { minWidth: 240, mt: 0.5, border: 1, borderColor: "divider" } } }}
        MenuListProps={{ "aria-label": "Library actions" }}
      >
        {onToggleView ? (
          <MenuItem onClick={run(onToggleView)} sx={{ minHeight: 44 }}>
            <ListItemIcon>{view === "list" ? <GridIcon fontSize="small" /> : <ListIcon fontSize="small" />}</ListItemIcon>
            <ListItemText primary={view === "list" ? "Show as covers" : "Show as a list"} />
          </MenuItem>
        ) : null}
        {/* Exports what the CURRENT filters match, not the rows rendered so
            far — the grid pages behind a sentinel, so those are usually a
            prefix. "These books", not "library": with a shelf or tag up,
            this is that subset. */}
        <MenuItem onClick={run(onExportCsv)} disabled={exportingCsv || !onExportCsv} sx={{ minHeight: 44 }}>
          <ListItemIcon>
            <ExportIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={exportingCsv ? "Exporting…" : "Export these books (CSV)"} />
        </MenuItem>
        <MenuItem onClick={run(onSelectBooks)} sx={{ minHeight: 44 }}>
          <ListItemIcon>
            <SelectIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Select books…" />
        </MenuItem>
      </Menu>
    </>
  );
}
