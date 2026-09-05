/**
 * ResponsiveTable — one ledger, two surfaces.
 *
 * The mobile grammar's table rule (MOBILE_UI_PLAN.md §2, §4 flockgeek): below
 * `md` a wide table renders as one card per row, not as a horizontal scroll.
 * FlockGeek had four of them — Birds (6 columns plus a 7-column expanded row),
 * the Hatch log (10), Pairings (6) and the Egg log (7) — each re-deriving the
 * same `<TableContainer>/<Table>/<TablePagination>` scaffolding. This owns all
 * of it so the pages describe *columns*, not markup.
 *
 * At `md`+: the familiar MUI table, with `TableSortLabel` headers and the full
 * `TablePagination` row.
 *
 * Below `md`, per row: a card whose title is the `primary` column and whose
 * body is a two-column label/value list of the rest. Row actions collapse into
 * a single 44px ⋯ that opens a `GeekSheet` action list — no hover, no 28px
 * icon pair. Sorting moves to a "Sort" pill above the cards that opens a sheet
 * of the sortable columns (tapping the active one flips the direction, which
 * is what `TableSortLabel` does on desktop). Pagination becomes a compact 44px
 * prev/next row; the rows-per-page select goes away on the phone, where it was
 * a 12px popover nobody could hit.
 *
 * Columns: `{ key, label, render?, primary?, align?, sortable?, cardHidden?,
 * cellSx?, headSx? }`.
 *   - `render(row)` supplies the cell/value node; without it the raw
 *     `row[key]` is printed.
 *   - `primary` marks the column that titles the card (at most one).
 *   - `sortable` (default: true when `onSort` is given and the column has a
 *     key) puts the column in the header's sort label and the Sort sheet.
 *   - `cardHidden` keeps a column out of the card body — used for the desktop
 *     "Actions" column, whose contents live in the ⋯ sheet instead.
 *
 * `renderDesktopRow(row)` is the escape hatch for a table whose `md`+ row is
 * not a row of cells: BirdsPage's expanding accordion row. The cards, sort,
 * empty state and pagination stay shared.
 *
 * `filters` (the fields, not their framing) is owned here too, because the
 * grammar puts filters and sort on the same surface: at `md`+ they are the
 * familiar Paper of fields above the table; below `md` four stacked full-width
 * fields pushed the first row off the screen, so they collapse into a
 * `[Filters · n]` pill beside the Sort pill, opening a sheet. `filterCount` is
 * the page's count of *active* filters — the badge on that pill.
 */
import { useState } from "react";
import {
  Box, Button, CircularProgress, IconButton, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, TableSortLabel, Typography,
  useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { GeekSheet, geekLayout } from "@geeksuite/ui";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import FilterListIcon from "@mui/icons-material/FilterList";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

const cellValue = (column, row) =>
  typeof column.render === "function" ? column.render(row) : (row?.[column.key] ?? "-");

const ResponsiveTable = ({
  columns = [],
  rows = [],
  getRowId = (row) => row?.id,
  rowLabel,
  sortBy,
  sortOrder = "asc",
  onSort,
  rowActions,
  actionSheetTitle = "Actions",
  loading = false,
  emptyMessage = "Nothing here yet",
  renderDesktopRow,
  page = 0,
  rowsPerPage = 10,
  count = 0,
  onPageChange,
  onRowsPerPageChange,
  rowsPerPageOptions = [5, 10, 25],
  filters,
  filterCount = 0,
  tableProps
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down(geekLayout.navBreakpoint));
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [actionRow, setActionRow] = useState(null);

  const primaryColumn = columns.find((c) => c.primary) || columns[0];
  const sortableColumns = onSort
    ? columns.filter((c) => c.key && (c.sortable ?? true))
    : [];
  const activeSort = sortableColumns.find((c) => c.key === sortBy);

  const titleFor = (row) => {
    if (typeof rowLabel === "function") return rowLabel(row);
    const value = primaryColumn ? cellValue(primaryColumn, row) : null;
    return typeof value === "string" || typeof value === "number" ? String(value) : "row";
  };

  const actionsFor = (row) =>
    (typeof rowActions === "function" ? rowActions(row) : rowActions) || [];

  const spinner = (
    <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress /></Box>
  );

  const pillSx = {
    minHeight: 44,
    borderRadius: 999,
    px: 2,
    fontSize: "0.8125rem",
    color: "text.secondary",
    borderColor: "divider"
  };

  /* ── The phone: one card per row ─────────────────────────────────────── */
  if (isMobile) {
    const from = count === 0 ? 0 : page * rowsPerPage + 1;
    const to = Math.min(count, (page + 1) * rowsPerPage);
    const lastPage = Math.max(0, Math.ceil(count / rowsPerPage) - 1);

    return (
      // The last card has to clear the thumb-zone FAB when the list is
      // scrolled to the end.
      <Box sx={{ pb: 9 }}>
        {(filters || sortableColumns.length > 0) && (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 1.5 }}>
            {filters ? (
              <Button
                onClick={() => setFilterSheetOpen(true)}
                startIcon={<FilterListIcon />}
                variant="outlined"
                sx={{
                  ...pillSx,
                  ...(filterCount ? { color: "primary.main", borderColor: "primary.main" } : null)
                }}
              >
                {filterCount ? `Filters · ${filterCount}` : "Filters"}
              </Button>
            ) : <Box />}
            {sortableColumns.length > 0 && (
              <Button
                onClick={() => setSortSheetOpen(true)}
                startIcon={<SwapVertIcon />}
                variant="outlined"
                sx={pillSx}
              >
                {activeSort ? `${activeSort.label} ${sortOrder === "asc" ? "↑" : "↓"}` : "Sort"}
              </Button>
            )}
          </Box>
        )}

        {loading ? spinner : rows.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary">{emptyMessage}</Typography>
          </Paper>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {rows.map((row) => {
              const actions = actionsFor(row);
              return (
                <Paper
                  key={getRowId(row)}
                  variant="outlined"
                  sx={{ p: 2, borderColor: "divider", bgcolor: "background.paper" }}
                >
                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 0.5 }}>
                    <Typography
                      component="div"
                      sx={{ flex: 1, minWidth: 0, fontSize: "1rem", fontWeight: 600, lineHeight: 1.35 }}
                    >
                      {primaryColumn ? cellValue(primaryColumn, row) : null}
                    </Typography>
                    {actions.length > 0 && (
                      <IconButton
                        aria-label={`Actions for ${titleFor(row)}`}
                        onClick={() => setActionRow(row)}
                        sx={{ width: 44, height: 44, flexShrink: 0, mt: -0.75, mr: -0.75 }}
                      >
                        <MoreHorizIcon />
                      </IconButton>
                    )}
                  </Box>

                  <Box
                    component="dl"
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "minmax(96px, 40%) 1fr",
                      columnGap: 2,
                      rowGap: 0.75,
                      m: 0,
                      pt: 1.25,
                      borderTop: (t) => `1px solid ${t.palette.divider}`
                    }}
                  >
                    {columns
                      .filter((c) => c !== primaryColumn && !c.cardHidden)
                      .map((column) => (
                        <Box key={column.key || column.label} sx={{ display: "contents" }}>
                          <Typography
                            component="dt"
                            sx={{
                              fontSize: "0.75rem",
                              letterSpacing: 0.4,
                              textTransform: "uppercase",
                              color: "text.muted",
                              alignSelf: "center"
                            }}
                          >
                            {column.label}
                          </Typography>
                          <Typography
                            component="dd"
                            sx={{ m: 0, fontSize: "0.875rem", color: "text.primary", minWidth: 0 }}
                          >
                            {cellValue(column, row)}
                          </Typography>
                        </Box>
                      ))}
                  </Box>
                </Paper>
              );
            })}
          </Box>
        )}

        {!loading && count > rowsPerPage && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              mt: 2,
              pt: 1,
              borderTop: (t) => `1px solid ${t.palette.divider}`
            }}
          >
            <IconButton
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => onPageChange?.(null, page - 1)}
              sx={{ width: 44, height: 44 }}
            >
              <ChevronLeftIcon />
            </IconButton>
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
              {from}–{to} of {count}
            </Typography>
            <IconButton
              aria-label="Next page"
              disabled={page >= lastPage}
              onClick={() => onPageChange?.(null, page + 1)}
              sx={{ width: 44, height: 44 }}
            >
              <ChevronRightIcon />
            </IconButton>
          </Box>
        )}

        {/* Filter sheet — the grammar's home for pickers below `md`. */}
        <GeekSheet
          open={filterSheetOpen}
          onClose={() => setFilterSheetOpen(false)}
          title="Filters"
          snap="content"
          actions={<Button fullWidth variant="contained" onClick={() => setFilterSheetOpen(false)}>Done</Button>}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1, pb: 1 }}>
            {filters}
          </Box>
        </GeekSheet>

        {/* Sort sheet — the phone's TableSortLabel row. */}
        <GeekSheet
          open={sortSheetOpen}
          onClose={() => setSortSheetOpen(false)}
          title="Sort by"
          snap="content"
        >
          <Box sx={{ display: "flex", flexDirection: "column", pb: 1 }}>
            {sortableColumns.map((column) => {
              const active = column.key === sortBy;
              return (
                <Button
                  key={column.key}
                  onClick={() => { onSort?.(column.key); setSortSheetOpen(false); }}
                  endIcon={active
                    ? (sortOrder === "asc" ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />)
                    : null}
                  sx={{
                    justifyContent: "space-between",
                    minHeight: 48,
                    px: 2,
                    fontSize: "0.9375rem",
                    fontWeight: active ? 600 : 400,
                    color: active ? "primary.main" : "text.primary"
                  }}
                >
                  {column.label}
                </Button>
              );
            })}
          </Box>
        </GeekSheet>

        {/* Row action sheet — what used to be a pair of hover-sized icons. */}
        <GeekSheet
          open={Boolean(actionRow)}
          onClose={() => setActionRow(null)}
          title={actionRow ? titleFor(actionRow) : actionSheetTitle}
          snap="content"
        >
          <Box sx={{ display: "flex", flexDirection: "column", pb: 1 }}>
            {(actionRow ? actionsFor(actionRow) : []).map((action) => (
              <Button
                key={action.id || action.label}
                startIcon={action.icon}
                onClick={() => { setActionRow(null); action.onClick?.(actionRow); }}
                color={action.color || "inherit"}
                sx={{ justifyContent: "flex-start", minHeight: 48, px: 2, fontSize: "0.9375rem" }}
              >
                {action.label}
              </Button>
            ))}
          </Box>
        </GeekSheet>
      </Box>
    );
  }

  /* ── Desktop: the ledger as a table ───────────────────────────────────── */
  return (
    <>
      {filters && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
            {filters}
          </Box>
        </Paper>
      )}
      <TableContainer component={Paper}>
        {loading ? spinner : (
          <>
            <Table {...tableProps}>
            <TableHead sx={{ backgroundColor: "action.hover" }}>
              <TableRow>
                {columns.map((column) => {
                  const sortable = onSort && column.key && (column.sortable ?? true);
                  return (
                    <TableCell key={column.key || column.label} align={column.align} sx={column.headSx}>
                      {sortable ? (
                        <TableSortLabel
                          active={sortBy === column.key}
                          direction={sortBy === column.key ? sortOrder : "asc"}
                          onClick={() => onSort(column.key)}
                        >
                          {column.label}
                        </TableSortLabel>
                      ) : column.label}
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} align="center" sx={{ py: 4 }}>{emptyMessage}</TableCell>
                </TableRow>
              ) : rows.map((row) => (
                typeof renderDesktopRow === "function" ? renderDesktopRow(row) : (
                  <TableRow key={getRowId(row)} hover>
                    {columns.map((column) => (
                      <TableCell key={column.key || column.label} align={column.align} sx={column.cellSx}>
                        {cellValue(column, row)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              ))}
            </TableBody>
          </Table>
            <TablePagination
              rowsPerPageOptions={rowsPerPageOptions}
              component="div"
              count={count}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={onPageChange}
              onRowsPerPageChange={onRowsPerPageChange}
            />
          </>
        )}
      </TableContainer>
    </>
  );
};

export default ResponsiveTable;
