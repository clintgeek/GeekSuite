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
 * enabled. Stopping one is the **Remove key** button: the server treats a blank
 * key as "keep the stored one" (it can never be echoed back to the client), so
 * "empty the box to disable" was never something this page could deliver
 * (Chef, 2026-09-08). Removing deletes the credential; the rotation stops
 * calling the provider at once.
 *
 * The roster is `Object.keys(config)` — whatever `aiConfig` returned. It used
 * to be `CONFIG_PROVIDERS`, a hand-typed copy of the server's list, which is
 * how `llm7` stayed on this page for three months after the provider was
 * retired everywhere else.
 *
 * The key box holds a *draft*: the server sends `{ hasKey, keyHint, enabled }`
 * and never a credential, so the placeholder shows the last four characters to
 * tell two keys apart and an untouched box saves nothing.
 *
 * Rows are collapsed by default (2026-09-15). Nine providers each rendering a
 * permanent password field and two lines of helper text gave this block about
 * 1300px, nearly all of it empty boxes for the one action you take least often
 * — a key gets pasted once and then works for months. Worse, nine identical
 * password boxes made it genuinely unclear which one you meant to fill.
 *
 * So the default view is a roster: one line per provider, name and chip, which
 * is what you actually come here to read. The field appears when you say which
 * provider you are changing. A row whose listing failed opens itself, because
 * that is the row you came to fix.
 *
 * Once open a row stays open until you close it. Collapsing on blur would be
 * tidier and would sometimes eat a key you were still looking at.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { GeekErrorState } from '@geeksuite/ui';
import { useTheme } from '@mui/material/styles';
import { providerAnchorId } from './useAIGeek';
import { filledChipSx } from './chipTone';
import { RemoveProviderKeyDialog } from './dialogs/ConfirmDialogs';

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
        <Chip
          size="small"
          color="error"
          label="listing failed"
          sx={(theme) => ({ fontSize: 12, ...filledChipSx(theme, 'error') })}
        />
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
        // Only the filled variant sits on a tinted fill; the outlined one is
        // ink on paper and the theme already measures that.
        sx={(theme) => ({ fontSize: 12, ...(alive > 0 ? filledChipSx(theme, 'success') : null) })}
      />
    </Tooltip>
  );
}

/**
 * What the provider itself said about our quota — never an inference.
 *
 * `quota` carries `x-ratelimit-*` as stated: the ceiling from
 * `x-ratelimit-limit-*`, and `remaining` from our last real call. Seven of the
 * nine providers send none of this, and for those the line says so rather than
 * showing a zero that would read as "nothing left". Knowing the difference
 * between "no quota" and "no information" is the whole point of the line.
 */
function QuotaLine({ quota }) {
  const muted = useTheme().palette.text.secondary;
  if (!quota) {
    return (
      <Typography variant="caption" sx={{ color: muted, fontSize: 12 }}>
        sends no rate-limit headers — a 429 is the only signal
      </Typography>
    );
  }
  const parts = [];
  if (quota.requestsPerMinute) parts.push(`${quota.requestsPerMinute.toLocaleString()}/min`);
  if (quota.requestsPerDay) parts.push(`${quota.requestsPerDay.toLocaleString()}/day`);
  if (Number.isFinite(quota.remaining)) parts.push(`${quota.remaining.toLocaleString()} left`);
  if (parts.length === 0) return null;
  return (
    <Typography variant="caption" sx={{ color: muted, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
      {parts.join(' · ')}
    </Typography>
  );
}

function ProviderRow({
  provider,
  label,
  entry,
  quota,
  counts,
  listingFailed,
  statusKnown,
  saving,
  open,
  onToggle,
  onFieldChange,
  onBlurSave,
  onRemoveKey,
}) {
  return (
    <Box
      // The anchor the `provider_dead` / `provider_listing_failed` attention
      // items scroll to. `providerAnchorId` is the shared spelling.
      id={providerAnchorId(provider)}
      // Without this the smooth scroll lands with the row jammed under the
      // shell's sticky top bar.
      sx={{ scrollMarginTop: 88, py: 1, borderTop: '1px solid', borderColor: 'divider' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minHeight: 44 }}>
        {/*
          * The vendor's own spelling, from `status.catalog.labels`. Capitalising
          * the raw id gave "Openrouter" and "Llmgateway"; the canonical labels
          * live in the API's provider roster and are what the attention items
          * have always used. `capitalize` stays only as the fallback for an id
          * the payload does not carry a label for.
          */}
        <Typography variant="subtitle2" sx={label ? undefined : { textTransform: 'capitalize' }}>
          {label || provider}
        </Typography>
        <ProviderChip
          hasKey={entry.hasKey}
          listingFailed={listingFailed}
          counts={counts}
          statusKnown={statusKnown}
        />
        {/*
          * The stored key's last characters, on the collapsed line. This is the
          * only thing the old always-open field told you that the roster did
          * not, and it is the one fact that distinguishes two keys.
          */}
        {entry.hasKey && entry.keyHint && !open && (
          <Typography
            variant="caption"
            color="text.muted"
            sx={{ fontFamily: 'monospace', fontSize: 12 }}
          >
            {entry.keyHint}
          </Typography>
        )}
        {saving && <CircularProgress size={14} />}

        {/* Only where a key is stored: an unconfigured provider has told us
            nothing because we have never asked it anything. */}
        {entry.hasKey && !open && (
          <QuotaLine quota={quota} />
        )}

        <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
          <Button
            size="small"
            variant={entry.hasKey ? 'text' : 'outlined'}
            onClick={() => onToggle(provider)}
            sx={{ minHeight: 44, fontSize: 12 }}
          >
            {open ? 'Done' : entry.hasKey ? 'Replace key' : 'Add key'}
          </Button>
          {entry.hasKey && (
            <Button
              size="small"
              color="error"
              variant="outlined"
              onClick={() => onRemoveKey(provider)}
              disabled={saving}
              sx={{ minHeight: 44, fontSize: 12 }}
            >
              Remove key
            </Button>
          )}
        </Stack>
      </Box>

      <Collapse in={open} unmountOnExit>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: provider === 'cloudflare' ? '2fr 1fr' : '1fr' },
            gap: 1.5,
            pt: 1.5,
            pb: 1,
          }}
        >
          <TextField
            fullWidth
            // The row was opened to type in this box; opening it and then
            // asking for a click is a step with no decision in it.
            autoFocus
            label="API key"
            type="password"
            autoComplete="new-password"
            value={entry.apiKey || ''}
            onChange={(e) => onFieldChange(provider, 'apiKey', e.target.value)}
            onBlur={() => onBlurSave(provider)}
            placeholder={entry.hasKey ? entry.keyHint : 'Paste a key'}
            helperText={entry.hasKey
              ? `Replaces the stored key (${entry.keyHint || '…'}). Paste and click away.`
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
              // Deliberately not masked, and deliberately said out loud: this
              // is the identifier out of the Cloudflare dashboard URL, not a
              // credential, and it is useless without the token. It used to sit
              // in the open next to masked key boxes, which made it look like
              // a leak; the honest fix is to label it, not to hide it.
              helperText="Identifier, not a secret — from your Cloudflare dashboard URL"
              sx={{ '& .MuiInputBase-root': { minHeight: 44 } }}
            />
          )}
        </Box>
      </Collapse>
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
  onRemoveKey,
}) {
  const providers = Object.keys(config);
  // Which provider the Remove-key confirm is open for. Transient, so it lives
  // here rather than in the reducer.
  const [removing, setRemoving] = useState(null);
  // Which rows have their key editor revealed. Opened by the user, or by a
  // failed listing below.
  const [opened, setOpened] = useState(() => new Set());
  const toggle = (provider) => setOpened(prev => {
    const next = new Set(prev);
    if (next.has(provider)) next.delete(provider);
    else next.add(provider);
    return next;
  });
  const byProvider = status?.catalog?.byProvider || null;
  const labels = status?.catalog?.labels || {};
  const quotaByProvider = status?.catalog?.quota || {};
  // `status` carries no per-provider error field — the failure is reported as
  // an attention item, which is where the exact text lives (§1). Reading it
  // back from there keeps one source of truth for "this key is wrong".
  const listingFailed = useMemo(() => new Set(
    (status?.attention || [])
      .filter(item => item.kind === 'provider_listing_failed' && item.provider)
      .map(item => item.provider)
  ), [status?.attention]);

  /*
   * A provider whose listing was refused is the row you came here to retype,
   * so it opens itself — once. `seeded` is why this is not simply folded into
   * the `open` prop: that would make the row reopen every time you closed it,
   * because the refusal is still in `status` until the next discovery run.
   */
  const seeded = useRef(new Set());
  useEffect(() => {
    const fresh = [...listingFailed].filter(p => !seeded.current.has(p));
    if (fresh.length === 0) return;
    fresh.forEach(p => seeded.current.add(p));
    setOpened(prev => new Set([...prev, ...fresh]));
  }, [listingFailed]);

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
          label={labels[provider]}
          quota={quotaByProvider[provider]}
          entry={config[provider]}
          counts={byProvider?.[provider]}
          listingFailed={listingFailed.has(provider)}
          statusKnown={!!byProvider}
          saving={savingProvider === provider}
          onFieldChange={onFieldChange}
          open={opened.has(provider)}
          onToggle={toggle}
          onBlurSave={onBlurSave}
          onRemoveKey={setRemoving}
        />
      ))}
      <RemoveProviderKeyDialog
        provider={removing}
        busy={!!removing && savingProvider === removing}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const provider = removing;
          setRemoving(null);
          if (provider && onRemoveKey) await onRemoveKey(provider);
        }}
      />
    </Box>
  );
}
