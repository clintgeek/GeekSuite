/**
 * ConfigurationTab — one card per provider: enable, key, test.
 *
 * The key box holds a *draft*. The server never sends a credential back, only
 * `{ hasKey, keyHint }`, so an empty box means "keep whatever is stored" and
 * the placeholder shows the last four characters to tell two keys apart. Save
 * omits the field entirely when the box is untouched — see `saveConfiguration`
 * in useAIGeek.
 */
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  Grid,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import {
  Save as SaveIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { GeekErrorState } from '@geeksuite/ui';
import TestPromptPanel from './TestPromptPanel';

/** Configured / disabled / not-configured, from what the server stores. */
const providerStatus = (providerConfig) => {
  if (!providerConfig) return 'not-configured';
  // `hasKey` is what the server stores; a draft is only a key once saved.
  if (!providerConfig.hasKey) return 'not-configured';
  if (!providerConfig.enabled) return 'disabled';
  return 'configured';
};

const STATUS_ICON = {
  configured: <CheckCircleIcon color="success" />,
  disabled: <WarningIcon color="warning" />,
  'not-configured': <ErrorIcon color="error" />,
};

const STATUS_TEXT = {
  configured: 'Configured',
  disabled: 'Disabled',
  'not-configured': 'Not Configured',
};

export default function ConfigurationTab({
  config,
  configError,
  loading,
  onFieldChange,
  onSave,
  onTest,
  onRetry,
}) {
  return (
    <>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            AI Provider Configuration
          </Typography>

          {configError && (
            <GeekErrorState
              title="Couldn't load provider configuration"
              description="Provider keys are admin-only; if you are not an admin this is expected."
              error={configError}
              onRetry={onRetry}
            />
          )}

          <Grid container spacing={3}>
            {Object.entries(config).map(([provider, providerConfig]) => {
              const status = providerStatus(providerConfig);
              return (
                <Grid item xs={12} md={6} key={provider}>
                  <Card variant="outlined">
                    <CardContent>
                      <Box display="flex" alignItems="center" gap={1} mb={2}>
                        {STATUS_ICON[status]}
                        <Typography variant="h6" sx={{ textTransform: 'capitalize' }}>
                          {provider}
                        </Typography>
                        <Chip
                          label={STATUS_TEXT[status]}
                          size="small"
                          color={status === 'configured' ? 'success' : 'default'}
                        />
                      </Box>

                      <FormControlLabel
                        control={(
                          <Switch
                            checked={providerConfig.enabled}
                            onChange={(e) => onFieldChange(provider, 'enabled', e.target.checked)}
                          />
                        )}
                        label="Enabled"
                      />

                      <TextField
                        fullWidth
                        label="API Key"
                        type="password"
                        autoComplete="new-password"
                        value={providerConfig.apiKey || ''}
                        onChange={(e) => onFieldChange(provider, 'apiKey', e.target.value)}
                        margin="normal"
                        placeholder={providerConfig.hasKey ? providerConfig.keyHint : 'Paste a key'}
                        helperText={providerConfig.hasKey
                          ? 'A key is stored — leave blank to keep it'
                          : 'No key stored yet'}
                      />

                      {provider === 'cloudflare' && (
                        <TextField
                          fullWidth
                          label="Account ID"
                          type="text"
                          value={providerConfig.accountId || ''}
                          onChange={(e) => onFieldChange(provider, 'accountId', e.target.value)}
                          margin="normal"
                          helperText="Your Cloudflare account ID"
                        />
                      )}

                      <Box mt={2}>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => onTest(provider)}
                          disabled={loading || !providerConfig.hasKey}
                          sx={{ minHeight: 44 }}
                        >
                          Test API Key
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          <Box mt={3}>
            <Button
              variant="contained"
              onClick={onSave}
              disabled={loading}
              startIcon={<SaveIcon />}
              sx={{ minHeight: 44 }}
            >
              Save Configuration
            </Button>
          </Box>
        </CardContent>
      </Card>

      <TestPromptPanel config={config} />
    </>
  );
}
