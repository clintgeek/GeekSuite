import { Box, Typography } from "@mui/material";

const entries = [
  { key: "birdsCount", label: "Birds", unit: "active" },
  { key: "groupsCount", label: "Groups" },
  { key: "avgDailyEggs", label: "Eggs / day", unit: "avg" },
  { key: "hatchCount", label: "Hatches", unit: "recent" }
];

const SummaryCards = ({ stats }) => {
  const data = {
    ...stats,
    hatchCount: (stats?.recentHatches || []).length
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        borderTop: (theme) => `1px solid ${theme.palette.divider}`,
        borderBottom: (theme) => `1px solid ${theme.palette.divider}`
      }}
    >
      {entries.map(({ key, label, unit }, i) => (
        <Box
          key={key}
          sx={{
            flex: { xs: "1 1 50%", md: "1 1 0" },
            py: 1.75,
            pr: 3,
            borderRight: (theme) =>
              i < entries.length - 1
                ? { xs: i % 2 === 0 ? `1px solid ${theme.palette.divider}` : "none", md: `1px solid ${theme.palette.divider}` }
                : "none",
            pl: i === 0 ? 0 : { xs: i % 2 === 1 ? 2 : 0, md: 3 },
            borderBottom: (theme) => ({ xs: i < 2 ? `1px solid ${theme.palette.divider}` : "none", md: "none" })
          }}
        >
          <Typography
            variant="body2"
            sx={{ color: "text.disabled", fontSize: "0.6875rem", letterSpacing: 0.5, textTransform: "uppercase", mb: 0.25 }}
          >
            {label}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
            <Typography
              component="span"
              sx={{
                fontFamily: '"DM Serif Display", Georgia, serif',
                fontSize: "1.75rem",
                fontWeight: 400,
                lineHeight: 1,
                color: "text.primary"
              }}
            >
              {data[key] ?? "—"}
            </Typography>
            {unit && data[key] != null && (
              <Typography component="span" variant="body2" sx={{ color: "text.disabled" }}>
                {unit}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

export default SummaryCards;
