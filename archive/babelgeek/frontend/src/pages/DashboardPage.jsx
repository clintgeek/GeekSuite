import RefreshIcon from "@mui/icons-material/Refresh";
import { Alert, Button, Card, CardContent, CircularProgress, Grid, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useApi } from "../hooks/useApi";

const cards = [
  {
    title: "API Status",
    description: "Connect to /api/health to confirm backend availability and latency.",
    metric: "200 OK",
    hint: "Swap in real uptime metrics via your monitoring tool."
  },
  {
    title: "Auth State",
    description: "User context flows from AuthProvider. Replace mock login with real tokens.",
    metric: "Guest",
    hint: "Wire to backend /api/auth/login once implemented."
  },
  {
    title: "Next Steps",
    description: "Add feature routes, data visualizations, and shared Geek Suite widgets.",
    metric: "Plan",
    hint: "Keep spacing on the 8px grid and reuse theme tokens."
  }
];

const DashboardPage = () => {
  const { request, loading, error } = useApi();
  const [health, setHealth] = useState(null);

  const fetchHealth = useCallback(async () => {
    const data = await request({ method: "GET", url: "/health" });
    setHealth(data);
  }, [request]);

  useEffect(() => {
    fetchHealth().catch(() => {}); // Kick off initial health check when the dashboard loads.
  }, [fetchHealth]);

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h2">Starter Dashboard</Typography>
        <Button
          variant="outlined"
          startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
          onClick={fetchHealth}
          disabled={loading}
        >
          Refresh Health
        </Button>
      </Stack>

      {error && <Alert severity="error">{error.message}</Alert>}

      {health && (
        <Alert severity="success">
          Backend responded at {new Date(health.timestamp).toLocaleTimeString()} in the {health.environment} environment.
        </Alert>
      )}

      <Grid container spacing={3}>
        {cards.map(({ title, description, metric, hint }) => (
          <Grid item xs={12} md={4} key={title}>
            <Card>
              <CardContent>
                <Typography variant="h5" gutterBottom>
                  {title}
                </Typography>
                <Typography variant="h3" color="primary" gutterBottom>
                  {metric}
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  {description}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {hint}
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
