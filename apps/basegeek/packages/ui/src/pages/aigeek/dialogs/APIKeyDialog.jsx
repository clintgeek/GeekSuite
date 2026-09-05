/**
 * APIKeyDialog / NewKeyDialog — minting and editing the credential that now
 * decides routing.
 *
 * These moved here from the standalone `pages/APIKeysPage.jsx`, which is gone.
 * Keys stopped being a filing cabinet the day aiGeek started resolving the
 * caller from the key's own `appName` instead of trusting a body field: a key
 * *is* an app's identity, so it belongs next to that app's routing row rather
 * than on a page of its own two clicks away.
 *
 * `appName` is not editable, on either arm. On edit the server ignores it
 * outright (`updateAPIKey` takes no appName), and on create it is prefilled
 * from the group being minted into — typing a different one there would file
 * the key under an app whose routing row the admin is not looking at.
 *
 * The plaintext is shown exactly once, by `NewKeyDialog`: the server stores a
 * SHA-256 hash and cannot ever show it again.
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ContentCopy as CopyIcon } from '@mui/icons-material';
import { useId } from 'react';
import ConsoleDialog from '../../../components/primitives/ConsoleDialog';
import { AVAILABLE_PERMISSIONS } from '../apiKeyDraft';

const RATE_FIELDS = [
  { field: 'requestsPerMinute', label: 'Per minute', max: 1000 },
  { field: 'requestsPerHour', label: 'Per hour', max: 10000 },
  { field: 'requestsPerDay', label: 'Per day', max: 100000 },
];

export default function APIKeyDialog({ editing, saving, onPatch, onPatchRate, onCancel, onSave }) {
  const formId = useId();
  const creating = editing?.mode === 'create';

  return (
    <ConsoleDialog
      open={!!editing}
      onClose={onCancel}
      eyebrow="API Key"
      title={creating ? `Mint key — ${editing?.appName}` : `Edit key — ${editing?.name}`}
      primaryAction={(
        <Button
          type="submit"
          form={formId}
          variant="contained"
          disabled={saving || !editing?.name?.trim()}
          sx={{ minHeight: 44 }}
        >
          {creating ? 'Mint key' : 'Save'}
        </Button>
      )}
      secondaryAction={<Button onClick={onCancel} sx={{ minHeight: 44 }}>Cancel</Button>}
    >
      <form
        id={formId}
        onSubmit={(e) => { e.preventDefault(); onSave(); }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Name"
            value={editing?.name ?? ''}
            onChange={(e) => onPatch({ name: e.target.value })}
            required
            fullWidth
            helperText="What this key is for — “storygeek production”, “laptop scratch”."
          />

          <TextField
            label="App"
            value={editing?.appName ?? ''}
            disabled
            fullWidth
            helperText="aiGeek resolves the caller from this. It is fixed for the life of the key."
          />

          <TextField
            label="Description"
            value={editing?.description ?? ''}
            onChange={(e) => onPatch({ description: e.target.value })}
            multiline
            rows={2}
            fullWidth
          />

          <FormControl fullWidth>
            <InputLabel id={`${formId}-perms`}>Permissions</InputLabel>
            <Select
              multiple
              labelId={`${formId}-perms`}
              label="Permissions"
              value={editing?.permissions ?? []}
              onChange={(e) => onPatch({ permissions: e.target.value })}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={value.replace('ai:', '')} size="small" sx={{ fontSize: 12 }} />
                  ))}
                </Box>
              )}
            >
              {AVAILABLE_PERMISSIONS.map((perm) => (
                <MenuItem key={perm.value} value={perm.value} sx={{ minHeight: 44, display: 'block', py: 1 }}>
                  <Typography variant="body2">{perm.label}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
                    {perm.description}
                  </Typography>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.75 }}>Rate limit</Typography>
            <Grid container spacing={1.5}>
              {RATE_FIELDS.map(({ field, label, max }) => (
                <Grid item xs={12} sm={4} key={field}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label={label}
                    value={editing?.rateLimit?.[field] ?? ''}
                    onChange={(e) => onPatchRate(field, e.target.value)}
                    inputProps={{ min: 1, max }}
                  />
                </Grid>
              ))}
            </Grid>
          </Box>

          <TextField
            label="Expires"
            type="date"
            value={editing?.expiresAt ?? ''}
            onChange={(e) => onPatch({ expiresAt: e.target.value })}
            InputLabelProps={{ shrink: true }}
            helperText="Leave empty for no expiration"
            fullWidth
          />

          {!creating && (
            <FormControlLabel
              control={(
                <Switch
                  checked={editing?.isActive !== false}
                  onChange={(e) => onPatch({ isActive: e.target.checked })}
                />
              )}
              label="Active"
            />
          )}
        </Box>
      </form>
    </ConsoleDialog>
  );
}

/** The one and only sighting of the plaintext. */
export function NewKeyDialog({ apiKey, onCopy, onClose }) {
  return (
    <ConsoleDialog
      open={!!apiKey}
      onClose={onClose}
      eyebrow="API Key"
      title="Key minted"
      primaryAction={(
        <Button onClick={onClose} variant="contained" sx={{ minHeight: 44 }}>
          I&apos;ve saved it
        </Button>
      )}
    >
      <Alert severity="warning" sx={{ mb: 2, fontSize: 12 }}>
        This is the only time this key is shown. baseGeek stores a hash of it and cannot
        show it again — if it is lost, mint a new one.
      </Alert>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 2,
          bgcolor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        <Typography
          variant="body2"
          fontFamily='"Geist Mono", monospace'
          sx={{ flexGrow: 1, wordBreak: 'break-all', fontSize: 12 }}
        >
          {apiKey}
        </Typography>
        <Tooltip title="Copy key">
          <IconButton onClick={() => onCopy(apiKey)} sx={{ minWidth: 44, minHeight: 44 }}>
            <CopyIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </ConsoleDialog>
  );
}
