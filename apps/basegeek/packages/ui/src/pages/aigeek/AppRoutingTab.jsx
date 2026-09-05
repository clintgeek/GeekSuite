/**
 * AppRoutingTab — which model answers for which app, as data rather than code.
 *
 * Apps that call with `model: "basegeek-app"`, `useAppConfig: true`, or simply
 * identify themselves by `appName` and name no provider are routed by the row
 * they own here. An app that has called but has no row yet shows up under
 * "Discovered" — one tap starts its config.
 */
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  TextField,
  Typography,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { GeekEmptyState, GeekErrorState } from '@geeksuite/ui';

/** The one-line description of where an app's calls actually go. */
const routingLine = (app) => {
  if (app.tier === 'specific') return `${app.provider}/${app.model}`;
  if (app.tier === 'free') return 'Uses free-tier rotation';
  if (app.tier === 'rotation') return 'Uses all-provider rotation';
  return null;
};

export default function AppRoutingTab({
  appConfigs,
  discoveredApps,
  appConfigsLoading,
  appConfigsError,
  newAppName,
  onNewAppNameChange,
  onRefresh,
  onAddApp,
  onEdit,
  onDelete,
}) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6">App Routing — Server-Side Model Configuration</Typography>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={onRefresh}
            disabled={appConfigsLoading}
            sx={{ minHeight: 44 }}
          >
            Refresh
          </Button>
        </Box>

        <Alert severity="info" sx={{ mb: 3, fontSize: 12 }}>
          Apps using <code>model: &quot;basegeek-app&quot;</code> or <code>useAppConfig: true</code> are
          routed by these settings. An app that identifies itself with <code>appName</code> and names
          no provider lands here too.
        </Alert>

        {appConfigsError ? (
          <GeekErrorState
            title="Couldn't load app routing"
            error={appConfigsError}
            onRetry={onRefresh}
          />
        ) : appConfigsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
        ) : (
          <>
            {discoveredApps.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Discovered apps (unconfigured)</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {discoveredApps.map(appName => (
                    <Chip
                      key={appName}
                      label={appName}
                      icon={<AddIcon />}
                      onClick={() => onAddApp(appName)}
                      color="info"
                      variant="outlined"
                      sx={{ height: 44, fontSize: 12 }}
                    />
                  ))}
                </Box>
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 1, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                size="small"
                label="New app name"
                value={newAppName}
                onChange={(e) => onNewAppNameChange(e.target.value)}
                placeholder="e.g. myNewApp"
              />
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                disabled={!newAppName.trim()}
                onClick={() => onAddApp(newAppName.trim())}
                sx={{ minHeight: 44 }}
              >
                Add app
              </Button>
            </Box>

            <Grid container spacing={2}>
              {appConfigs.map((app) => (
                <Grid item xs={12} md={6} key={app.appName}>
                  <Card variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="h6" noWrap>{app.displayName || app.appName}</Typography>
                          {app.displayName && app.displayName !== app.appName && (
                            <Typography variant="caption" color="text.secondary">{app.appName}</Typography>
                          )}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <Chip
                            label={app.tier}
                            size="small"
                            color={app.tier === 'free' ? 'success' : app.tier === 'specific' ? 'primary' : 'default'}
                          />
                          <Chip
                            label={app.enabled ? 'Active' : 'Disabled'}
                            size="small"
                            color={app.enabled ? 'success' : 'default'}
                            variant="outlined"
                          />
                          {app.autoDiscovered && <Chip label="Auto" size="small" variant="outlined" />}
                        </Box>
                      </Box>

                      {routingLine(app) && (
                        <Typography
                          variant="body2"
                          color={app.tier === 'specific' ? 'text.primary' : 'text.secondary'}
                          sx={{ mb: 1, wordBreak: 'break-all' }}
                        >
                          {routingLine(app)}
                        </Typography>
                      )}

                      {app.notes && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, fontSize: 12 }}>
                          {app.notes}
                        </Typography>
                      )}

                      {app.lastSeen && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 12 }}>
                          Last seen: {new Date(parseInt(app.lastSeen)).toLocaleString()}
                        </Typography>
                      )}

                      <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => onEdit(app)}
                          sx={{ minHeight: 44 }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => onDelete(app.appName)}
                          sx={{ minHeight: 44 }}
                        >
                          Delete
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {appConfigs.length === 0 && (
              <GeekEmptyState
                title="No app configs yet"
                description="Apps are auto-discovered when they connect, or add one manually above."
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
