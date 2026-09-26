/**
 * The library's ⋯ menu, beside the sort in the header (`@geeksuite/collection`
 * LibraryHeader `actions`): what the pre-C2 filter sheet kept at its foot —
 * export what the filters match, select books for the device basket, and the
 * (disabled) merge. On a phone it also carries the covers/list switch, which
 * would not fit on the header row there beside Filters, Sort and Save.
 */
import React, { useState } from "react";
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import {
  CheckBoxOutlined as SelectIcon,
  FileDownloadOutlined as ExportIcon,
  GridView as GridIcon,
  MergeType as MergeIcon,
  MoreHoriz as MoreIcon,
  ViewList as ListIcon,
} from "@mui/icons-material";

const roundIconSx = { width: 44, height: 44, border: 1, borderColor: "border", borderRadius: "999px", color: "text.primary" };

export default function LibraryActions({
  view,
  onToggleView,
  onExportCsv,
  exportingCsv = false,
  onSelectBooks,
  showMergeUi = false,
  onMerge,
  mergeLoading = false,
  mergeCount = 0,
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
        {showMergeUi ? (
          <MenuItem onClick={run(onMerge)} disabled={mergeLoading || mergeCount !== 2} sx={{ minHeight: 44 }}>
            <ListItemIcon>
              <MergeIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={mergeLoading ? "Merging…" : `Merge selected (${ mergeCount }/2)`} />
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}
