import RefreshIcon from "@mui/icons-material/RefreshOutlined";
import { Alert, Box, Button, Card, CardContent, CircularProgress, Grid, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useCallback, useEffect, useState } from "react";

const cards = [
  {
    title: "API Status",
    description: "Connect to /api/health to confirm backend availability and latency.",
    metric: "200 OK",
    accent: "#3d6b4f"
  },
  {
    title: "Auth State",
    description: "User context flows from AuthProvider via BaseGeek SSO.",
    metric: "Active",
    accent: "#d4910a"
  },
  {
    title: "Next Steps",
    description: "Add feature routes, flock visualizations, and domain-specific widgets.",
    metric: "Plan",
    accent: "#64748b"
  }
];

const DashboardPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [health, setHealth] = useState(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth().catch(() => {});
  }, [fetchHealth]);

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="overline" sx={{ color: "text.disabled", display: "block" }}>System</Typography>
          <Typography variant="h2">Flock overview</Typography>
        </Box>
        <Button
          variant="outlined"
          color="inherit"
          startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon />}
          onClick={fetchHealth}
          disabled={loading}
          size="small"
          sx={{ borderColor: "divider" }}
        >
          Refresh
        </Button>
      </Box>

      {error && <Alert severity="error">{error.message}</Alert>}

      {health && (
        <Alert severity="success" variant="outlined">
          Backend responded at {new Date(health.timestamp).toLocaleTimeString()} in the {health.environment} environment.
        </Alert>
      )}

      <Grid container spacing={2.5}>
        {cards.map(({ title, description, metric, accent }) => (
          <Grid item xs={12} md={4} key={title}>
            <Card
              sx={{
                position: "relative",
                overflow: "hidden",
                "&::before": {
                  content: '""',
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: 3,
                  height: "100%",
                  bgcolor: accent
                }
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
                  {title}
                </Typography>
                <Typography variant="h2" sx={{ color: accent, mb: 1.5 }}>
                  {metric}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {description}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
};

export default DashboardPage;
