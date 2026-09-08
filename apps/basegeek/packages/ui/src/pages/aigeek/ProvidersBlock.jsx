/**
 * ProvidersBlock — the whole of provider onboarding: paste a key.
 *
 * What this replaces (§3): the Configuration tab, which asked for an Enable
 * switch, a key, a Test button and a Save-all per provider — four controls to
 * express one fact, three of which could disagree with the other. A key that
 * was pasted but not saved, a provider enabled with no key, a Test that passed
 * against a credential the rotation was not using: all reachable states.
 *
 * Now: a key field per row, saved on blur, and a chip. The chip is the test —
 * it is `status.catalog.byProvider`, which counts the rows the catalog job's
 * probe found answering *under our account*, which is the only thing "does
 * this key work" can honestly mean (Principle 1). A provider with a key is
 * enabled; emptying the box disables it.
 *
 * The roster is `Object.keys(config)` — whatever `aiConfig` returned. It used
 * to be `CONFIG_PROVIDERS`, a hand-typed copy of the server's list, which is
 * how `llm7` stayed on this page for three months after the provider was
 * retired everywhere else.
 *
 * The key box holds a *draft*: the server sends `{ hasKey, keyHint, enabled }`
 * and never a credential, so the placeholder shows the last four characters to
 * tell two keys apart and an untouched box saves nothing.
 */
import {
  Box,
  Chip,
  CircularProgress,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { GeekErrorState } from '@geeksuite/ui';
import { providerAnchorId } from './useAIGeek';

/**
 * The live chip for one provider.
 *
 * Four states, in the order they are worth knowing about: the listing failed
 * (the key is wrong — this is the Cerebras 401 today), no key at all, the
 * probe found rows, the probe found none.
 */
function ProviderChip({ hasKey, listingFailed, counts, statusKnown }) {
  if (listingFailed) {
    return (
      <Tooltip title="The provider's own model listing refused our key on the last discovery run">
        <Chip size="small" color="error" label="listing failed" sx={{ fontSize: 12 }} />
      </Tooltip>
    );
  }
  if (!hasKey) {
    return <Chip size="small" variant="outlined" label="no key" sx={{ fontSize: 12 }} />;
  }
  if (!statusKnown) {
    return <Chip size="small" variant="outlined" label="status unknown" sx={{ fontSize: 12 }} />;
  }
  const alive = counts?.alive ?? 0;
  const structured = counts?.structured ?? 0;
  return (
    <Tooltip title={counts?.cooling
      ? `${counts.cooling} row(s) cooling after a failure`
      : 'Rows the nightly probe found answering under our account'}>
      <Chip
        size="small"
        color={alive > 0 ? 'success' : 'warning'}
        variant={alive > 0 ? 'filled' : 'outlined'}
        label={`${alive} alive · ${structured} structured`}
        sx={{ fontSize: 12 }}
      />
    </Tooltip>
  );
}

function ProviderRow({ provider, entry, counts, listingFailed, statusKnown, saving, onFieldChange, onBlurSave }) {
  return (
    <Box
      // The anchor the `provider_dead` / `provider_listing_failed` attention
      // items scroll to. `providerAnchorId` is the shared spelling.
      id={providerAnchorId(provider)}
      // Without this the smooth scroll lands with the row jammed under the
      // shell's sticky top bar.
      sx={{ scrollMarginTop: 88, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>
          {provider}
        </Typography>
        <ProviderChip
          hasKey={entry.hasKey}
          listingFailed={listingFailed}
          counts={counts}
          statusKnown={statusKnown}
        />
        {saving && <CircularProgress size={14} />}
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: provider === 'cloudflare' ? '2fr 1fr' : '1fr' },
          gap: 1.5,
        }}
      >
        <TextField
          fullWidth
          label="API key"
          type="password"
          autoComplete="new-password"
          value={entry.apiKey || ''}
          onChange={(e) => onFieldChange(provider, 'apiKey', e.target.value)}
          onBlur={() => onBlurSave(provider)}
          placeholder={entry.hasKey ? entry.keyHint : 'Paste a key'}
          helperText={entry.hasKey
            ? 'A key is stored — leave blank to keep it, or clear the box to stop using this provider'
            : 'Paste a key and click away; that is the whole setup'}
          sx={{ '& .MuiInputBase-root': { minHeight: 44 } }}
        />

        {provider === 'cloudflare' && (
          <TextField
            fullWidth
            label="Account ID"
            value={entry.accountId || ''}
            onChange={(e) => onFieldChange(provider, 'accountId', e.target.value)}
            onBlur={() => onBlurSave(provider)}
            helperText="Cloudflare needs this alongside the token"
            sx={{ '& .MuiInputBase-root': { minHeight: 44 } }}
          />
        )}
      </Box>
    </Box>
  );
}

export default function ProvidersBlock({
  config,
  configError,
  savingProvider,
  status,
  onRetry,
  onFieldChange,
  onBlurSave,
}) {
  const providers = Object.keys(config);
  const byProvider = status?.catalog?.byProvider || null;
  // `status` carries no per-provider error field — the failure is reported as
  // an attention item, which is where the exact text lives (§1). Reading it
  // back from there keeps one source of truth for "this key is wrong".
  const listingFailed = new Set(
    (status?.attention || [])
      .filter(item => item.kind === 'provider_listing_failed' && item.provider)
      .map(item => item.provider)
  );

  if (configError) {
    return (
      <GeekErrorState
        title="Couldn't load provider configuration"
        description="Provider keys are admin-only; if you are not an admin this is expected."
        error={configError}
        onRetry={onRetry}
      />
    );
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 0.5 }}>Providers</Typography>
      <Typography variant="body2" color="text.muted" sx={{ fontSize: 12, mb: 1 }}>
        A key is the whole configuration. The chip is what the nightly probe found answering
        under our account — it is the test, so there is no Test button.
      </Typography>

      {providers.map(provider => (
        <ProviderRow
          key={provider}
          provider={provider}
          entry={config[provider]}
          counts={byProvider?.[provider]}
          listingFailed={listingFailed.has(provider)}
          statusKnown={!!byProvider}
          saving={savingProvider === provider}
          onFieldChange={onFieldChange}
          onBlurSave={onBlurSave}
        />
      ))}
    </Box>
  );
}
