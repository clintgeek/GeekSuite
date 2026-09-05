/**
 * CatalogTab — the models, their prices, and their free tiers, in one place.
 *
 * This is the merge of what used to be two tabs. "Free Tier Config" and "AI
 * Catalog" listed the same models from the same query and disagreed about them:
 * the catalog's per-model free-tier pencil wrote through `UPDATE_MODEL_FREE_TIER`
 * immediately, while the free-tier editor batched into `BULK_UPDATE_FREE_TIERS`
 * on Save All. Edit a model on one tab, switch to the other, and the row you
 * were looking at was stale — or worse, still dirty, and Save All would put the
 * old value back over the one you had just written.
 *
 * Now there is one list and one save path. Ticking **Free** or typing a limit
 * files a pending edit; the row highlights; `Save all` sends the batch. The
 * advanced dialog (audio limits and notes, which have no column here) still
 * writes its single model directly, and clears that model's pending edit as it
 * goes so the two cannot fight.
 *
 * Below `md` each model is a card and the four limits sit in a 2-column grid —
 * an eight-track row does not fit 390px, and the old tab's answer, a sideways
 * scroll inside every provider card, meant the numbers you were comparing were
 * never on screen together.
 */
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Refresh as RefreshIcon,
  Save as SaveIcon,
  Sync as SyncIcon,
  Edit as EditIcon,
  AttachMoney as MoneyIcon,
} from '@mui/icons-material';
import { GeekEmptyState, GeekErrorState } from '@geeksuite/ui';
import { formatPricingCell } from './format';

/** The four rate limits a row can edit inline, in column order. */
const LIMIT_FIELDS = [
  { key: 'requestsPerMinute', short: 'RPM', long: 'Requests / minute' },
  { key: 'requestsPerDay', short: 'RPD', long: 'Requests / day' },
  { key: 'tokensPerMinute', short: 'TPM', long: 'Tokens / minute' },
  { key: 'tokensPerDay', short: 'TPD', long: 'Tokens / day' },
];

/** FREE, PAID, or nothing at all when the price is genuinely unknown. */
const TierChip = ({ isFree, pricing }) => {
  if (isFree) return <Chip label="FREE" color="success" size="small" sx={{ fontSize: 12 }} />;
  if (pricing?.input === 'Unknown' || pricing?.input == null) return null;
  return <Chip label="PAID" size="small" variant="outlined" sx={{ fontSize: 12 }} />;
};

const LimitField = ({ field, value, disabled, onChange, compact }) => (
  <TextField
    size="small"
    type="number"
    label={compact ? field.short : undefined}
    placeholder={compact ? undefined : field.short}
    inputProps={{
      'aria-label': field.long,
      style: { textAlign: 'right', padding: compact ? '10px 8px' : '4px 6px', fontSize: 12 },
    }}
    disabled={disabled}
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value)}
    sx={compact ? { width: '100%' } : { width: 80 }}
  />
);

/** Both layouts want the same two icon buttons, so they live here once. */
const RowActions = ({ onEditPricing, onEditFreeTier }) => (
  <Box sx={{ display: 'flex', flexShrink: 0 }}>
    <Tooltip title="Edit pricing">
      <IconButton size="small" onClick={onEditPricing} sx={{ minWidth: 44, minHeight: 44 }}>
        <MoneyIcon fontSize="small" />
      </IconButton>
    </Tooltip>
    <Tooltip title="Advanced free tier — audio limits and notes">
      <IconButton size="small" onClick={onEditFreeTier} sx={{ minWidth: 44, minHeight: 44 }}>
        <EditIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  </Box>
);

function ModelRow({ model, freeTier, dirty, isCompact, onFlag, onLimit, onEditPricing, onEditFreeTier }) {
  const dirtyBg = (theme) => (dirty ? alpha(theme.palette.warning.main, 0.12) : 'transparent');

  if (isCompact) {
    return (
      <Card
        variant="outlined"
        sx={{ mb: 1, bgcolor: dirtyBg, borderColor: dirty ? 'warning.main' : 'divider' }}
      >
        <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} title={model.id}>
                {model.name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                sx={{ fontSize: 12, wordBreak: 'break-all' }}
              >
                {model.id}
              </Typography>
            </Box>
            <RowActions onEditPricing={onEditPricing} onEditFreeTier={onEditFreeTier} />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
            <Typography variant="caption" sx={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              in {formatPricingCell(model.pricing?.input)} · out {formatPricingCell(model.pricing?.output)}
            </Typography>
            <TierChip isFree={freeTier.isFree} pricing={model.pricing} />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
            <Checkbox
              size="small"
              checked={freeTier.isFree}
              onChange={(e) => onFlag(e.target.checked)}
              inputProps={{ 'aria-label': `Free tier for ${model.name}` }}
            />
            <Typography variant="body2" sx={{ fontSize: 12 }}>Free tier available</Typography>
          </Box>

          {/*
            Only free models get the limit grid here. A paid model's four
            disabled, empty boxes are 200px of a phone screen saying nothing —
            the desktop table keeps them because a table needs its columns.
          */}
          {freeTier.isFree && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 0.5 }}>
              {LIMIT_FIELDS.map((field) => (
                <LimitField
                  key={field.key}
                  field={field}
                  compact
                  value={freeTier.freeLimits?.[field.key]}
                  onChange={(value) => onLimit(field.key, value)}
                />
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 0.5,
        py: 0.25,
        borderRadius: 1,
        bgcolor: dirtyBg,
        '&:hover': {
          bgcolor: (theme) => (dirty ? alpha(theme.palette.warning.main, 0.2) : 'action.hover'),
        },
      }}
    >
      <Tooltip title={freeTier.isFree ? 'Mark as not free' : 'Mark as free'}>
        <Checkbox
          size="small"
          checked={freeTier.isFree}
          onChange={(e) => onFlag(e.target.checked)}
          sx={{ p: 0.5 }}
          inputProps={{ 'aria-label': `Free tier for ${model.name}` }}
        />
      </Tooltip>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap title={model.id}>{model.name}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap display="block">
          {model.id}
        </Typography>
      </Box>

      <Box sx={{ width: 64, flexShrink: 0, textAlign: 'center' }}>
        <TierChip isFree={freeTier.isFree} pricing={model.pricing} />
      </Box>

      {['input', 'output'].map((side) => (
        <Typography
          key={side}
          variant="body2"
          color={model.pricing?.[side] && model.pricing[side] !== 'Unknown' ? 'text.primary' : 'text.disabled'}
          sx={{ width: 72, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
        >
          {formatPricingCell(model.pricing?.[side])}
        </Typography>
      ))}

      {LIMIT_FIELDS.map((field) => (
        <LimitField
          key={field.key}
          field={field}
          disabled={!freeTier.isFree}
          value={freeTier.freeLimits?.[field.key]}
          onChange={(value) => onLimit(field.key, value)}
        />
      ))}

      <RowActions onEditPricing={onEditPricing} onEditFreeTier={onEditFreeTier} />
    </Box>
  );
}

/**
 * The catalog's headline numbers.
 *
 * Five cards is a reasonable strip at 1280px and half a screen of scrolling at
 * 390px — on a phone they pushed the first model below three folds. Compact
 * gets the same five facts as one line of chips.
 */
function CatalogSummary({ summary, freeModelCount, isCompact }) {
  const facts = [
    { label: 'Providers', short: 'providers', value: summary?.totalProviders || 0 },
    { label: 'Models', short: 'models', value: summary?.totalModels || 0 },
    { label: 'Free models', short: 'free', value: freeModelCount, tone: 'success.main' },
    { label: 'With API keys', short: 'keyed', value: summary?.providersWithKeys || 0 },
    { label: 'Enabled', short: 'enabled', value: summary?.enabledProviders || 0 },
  ];

  if (isCompact) {
    return (
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
        {facts.map(fact => (
          <Chip
            key={fact.label}
            size="small"
            variant="outlined"
            sx={{ fontSize: 12, color: fact.tone }}
            label={`${fact.value} ${fact.short}`}
          />
        ))}
      </Box>
    );
  }

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {facts.map(fact => (
        <Grid item xs={6} md={2.4} key={fact.label}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="subtitle2" sx={{ color: fact.tone || 'primary.main' }}>
                {fact.label}
              </Typography>
              <Typography variant="h4" sx={{ color: fact.tone || undefined }}>{fact.value}</Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

export default function CatalogTab({
  directorData,
  directorLoading,
  directorError,
  syncingProvider,
  savingBulk,
  dirtyCount,
  isCompact,
  modelFreeTier,
  isModelDirty,
  onRefresh,
  onSync,
  onFlag,
  onLimit,
  onSaveAll,
  onResetAll,
  onRestoreDefaults,
  onEditPricing,
  onEditFreeTier,
}) {
  const providers = Object.entries(directorData?.providers || {});
  // Counts pending edits, not just what the server last said — otherwise the
  // summary reads "1 free" while the provider chip right below it reads "2".
  const freeModelCount = providers.reduce(
    (sum, [providerName, provider]) =>
      sum + provider.models.filter(model => modelFreeTier(providerName, model).isFree).length,
    0
  );

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6">AI Catalog</Typography>
            {dirtyCount > 0 && (
              <Chip label={`${dirtyCount} unsaved`} color="warning" size="small" />
            )}
          </Box>
          {/* Four buttons do not fit 390px on one line — wrap, don't clip. */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={onRefresh}
              disabled={directorLoading || savingBulk}
              sx={{ minHeight: 44 }}
            >
              Refresh
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={onResetAll}
              disabled={savingBulk || directorLoading}
              sx={{ minHeight: 44 }}
            >
              Reset all free tiers
            </Button>
            <Button
              variant="outlined"
              color="warning"
              onClick={onRestoreDefaults}
              disabled={savingBulk || directorLoading}
              sx={{ minHeight: 44 }}
            >
              Restore defaults
            </Button>
            <Button
              variant="contained"
              startIcon={savingBulk ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              onClick={onSaveAll}
              disabled={savingBulk || dirtyCount === 0}
              sx={{ minHeight: 44 }}
            >
              Save all
            </Button>
          </Box>
        </Box>

        <Alert severity="info" sx={{ mb: 2, fontSize: 12 }}>
          {isCompact ? (
            <>Tick <strong>Free</strong> to unlock a model&apos;s limits. Edits are pending until <strong>Save all</strong>.</>
          ) : (
            <>
              Tick <strong>Free</strong> to put a model on the free tier; the limit fields
              unlock with it. Edits are pending until <strong>Save all</strong>. The
              <EditIcon sx={{ fontSize: 14, verticalAlign: 'middle', mx: 0.5 }} />
              button opens audio limits and notes, which save on their own.
            </>
          )}
        </Alert>

        {directorError ? (
          <GeekErrorState
            title="Couldn't load the catalog"
            error={directorError}
            onRetry={onRefresh}
          />
        ) : directorLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
        ) : directorData ? (
          <>
            <CatalogSummary
              summary={directorData.summary}
              freeModelCount={freeModelCount}
              isCompact={isCompact}
            />

            <Grid container spacing={2}>
              {providers.map(([providerName, provider]) => {
                const freeHere = provider.models.filter(
                  model => modelFreeTier(providerName, model).isFree
                ).length;

                return (
                  <Grid item xs={12} key={providerName}>
                    <Card variant="outlined">
                      <CardContent sx={{ pb: '8px !important' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                          <Typography variant="subtitle1" fontWeight="bold" sx={{ textTransform: 'capitalize' }}>
                            {providerName}
                          </Typography>
                          <Chip label={`${freeHere} free`} size="small" color="success" variant="outlined" />
                          <Chip label={`${provider.totalModels} total`} size="small" variant="outlined" />
                          <Chip
                            label={provider.hasApiKey ? 'API key' : 'No API key'}
                            color={provider.hasApiKey ? 'success' : 'error'}
                            size="small"
                          />
                          <Chip
                            label={provider.isEnabled ? 'Enabled' : 'Disabled'}
                            color={provider.isEnabled ? 'success' : 'warning'}
                            size="small"
                          />
                          <Box sx={{ flexGrow: 1 }} />
                          <Tooltip title="Sync models from the provider's API">
                            <span>
                              <Button
                                variant="outlined"
                                size="small"
                                startIcon={syncingProvider === providerName
                                  ? <CircularProgress size={16} />
                                  : <SyncIcon />}
                                onClick={() => onSync(providerName)}
                                disabled={syncingProvider !== null || !provider.hasApiKey}
                                sx={{ minHeight: 44 }}
                              >
                                Sync
                              </Button>
                            </span>
                          </Tooltip>
                        </Box>

                        {provider.models.length === 0 ? (
                          <GeekEmptyState
                            compact
                            title="No models"
                            description="Sync this provider to fetch its models from its API."
                          />
                        ) : isCompact ? (
                          provider.models.map((model, index) => (
                            <ModelRow
                              key={model.id ?? index}
                              isCompact
                              model={model}
                              freeTier={modelFreeTier(providerName, model)}
                              dirty={isModelDirty(providerName, model.id)}
                              onFlag={(value) => onFlag(providerName, model.id, value)}
                              onLimit={(field, value) => onLimit(providerName, model.id, field, value)}
                              onEditPricing={() => onEditPricing(providerName, model)}
                              onEditFreeTier={() => onEditFreeTier(providerName, model)}
                            />
                          ))
                        ) : (
                          // The row is a fixed-width track that cannot reflow.
                          // Header and rows share this wrapper so they scroll
                          // together on a narrow desktop window.
                          <Box sx={{ overflowX: 'auto', mx: -0.5, px: 0.5 }}>
                            <Box sx={{ minWidth: 780 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, mb: 0.5 }}>
                                <Box sx={{ width: 36 }} />
                                <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
                                  Model
                                </Typography>
                                <Box sx={{ width: 64 }} />
                                <Typography variant="body2" color="text.secondary" sx={{ width: 72, textAlign: 'right' }}>$/M in</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ width: 72, textAlign: 'right' }}>$/M out</Typography>
                                {LIMIT_FIELDS.map((field) => (
                                  <Typography
                                    key={field.key}
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ width: 80, textAlign: 'center' }}
                                  >
                                    {field.short}
                                  </Typography>
                                ))}
                                <Box sx={{ width: 88 }} />
                              </Box>

                              {provider.models.map((model, index) => (
                                <ModelRow
                                  key={model.id ?? index}
                                  model={model}
                                  freeTier={modelFreeTier(providerName, model)}
                                  dirty={isModelDirty(providerName, model.id)}
                                  onFlag={(value) => onFlag(providerName, model.id, value)}
                                  onLimit={(field, value) => onLimit(providerName, model.id, field, value)}
                                  onEditPricing={() => onEditPricing(providerName, model)}
                                  onEditFreeTier={() => onEditFreeTier(providerName, model)}
                                />
                              ))}
                            </Box>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          </>
        ) : (
          <GeekEmptyState
            title="No catalog loaded"
            description="Model information, pricing and free-tier limits are fetched on demand."
            action={(
              <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRefresh} sx={{ minHeight: 44 }}>
                Refresh
              </Button>
            )}
          />
        )}
      </CardContent>
    </Card>
  );
}
