import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

/**
 * ResponsiveTable — "wide table with no mobile form" (DOCS/MOBILE_UI_PLAN.md
 * §2 "Tables"): a real `<Table>` at `md`+ and one card per row, as a
 * label/value list, below it. The app decides column meaning; this
 * primitive only decides which surface renders.
 *
 * `columns`: `[{ key, label, render?(row), card?: boolean }]`. `render`
 * defaults to `row[key]`. `card: false` hides a column from the card body —
 * for a column already surfaced elsewhere (the row header, or folded into
 * `renderActions`).
 *
 * `renderCardHeader(row)` — optional prominent header for the card (e.g. the
 * row's name); when given, that value is not repeated in the label/value list
 * unless its column also has `card: true` explicitly.
 *
 * `renderActions(row)` — optional actions, rendered as a trailing table
 * column at `md`+ and a footer row on the card below it.
 *
 * Uses `theme.breakpoints.down('md')`, the suite's one layout breakpoint —
 * never `sm`, which is what `GeekDialog`/`GeekSheet` use internally for their
 * own full-screen threshold.
 */
export default function ResponsiveTable({
  columns,
  rows,
  rowKey = (row) => row.id,
  renderCardHeader,
  renderActions,
  emptyMessage = 'Nothing here yet.',
  sx,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (!rows || rows.length === 0) {
    return (
      <Box sx={{ py: 5, textAlign: 'center' }}>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{emptyMessage}</Typography>
      </Box>
    );
  }

  if (isMobile) {
    const cardColumns = columns.filter((col) => col.card !== false);
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, ...sx }}>
        {rows.map((row) => (
          <Box
            key={rowKey(row)}
            sx={{
              p: 2,
              borderRadius: '10px',
              border: '1px solid',
              borderColor: 'divider',
              backgroundColor: 'background.paper',
            }}
          >
            {renderCardHeader && (
              <Box sx={{ mb: 1.25 }}>{renderCardHeader(row)}</Box>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {cardColumns.map((col) => (
                <Box
                  key={col.key}
                  sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}
                >
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.muted', flexShrink: 0, pt: 0.1 }}>
                    {col.label}
                  </Typography>
                  <Box sx={{ fontSize: '0.8125rem', color: 'text.primary', textAlign: 'right', minWidth: 0 }}>
                    {col.render ? col.render(row) : row[col.key]}
                  </Box>
                </Box>
              ))}
            </Box>
            {renderActions && (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 0.5,
                  mt: 1.5,
                  pt: 1.5,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                }}
              >
                {renderActions(row)}
              </Box>
            )}
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={sx}>
      <Table>
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableCell key={col.key}>{col.label}</TableCell>
            ))}
            {renderActions && <TableCell>Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((col) => (
                <TableCell key={col.key}>{col.render ? col.render(row) : row[col.key]}</TableCell>
              ))}
              {renderActions && <TableCell>{renderActions(row)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
