/**
 * AppsKeysPanel — panel 3: who is calling, where their calls go, and the keys.
 *
 * This is the old Apps & keys tab with the routing controls brought out of the
 * dialog and onto the card, and with Providers moved in underneath it (§2).
 * The two belong on one panel: a provider key and an app's pin are the same
 * question asked from two ends — "which vendor answers for this caller".
 *
 * A group is an app id, and it can arrive from four directions: a key filed
 * under it, a routing row naming it, traffic seen from it with neither yet, or
 * the status endpoint's `apps` array. `startgeek` is the interesting case — it
 * calls in-process and presents no key, so it renders with an "internal" chip
 * where the others get Mint.
 *
 * Every control on a card writes straight through (`onPatchRouting`). There is
 * no Save button, because a switch that needs one is a chore and this page is
 * meant to have none; the routing *dialog* survives only for the fields a
 * monthly visit does not touch (display name, notes, token/temperature
 * overrides) and for an app that has no row yet.
 *
 * Below `md` the key tables become cards (`ResponsiveTable`); the group cards
 * are already one column there.
 */
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  FormControlLabel,
  IconButton,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Block as BlockIcon,
  VpnKey as VpnKeyIcon,
  ContentCopy as CopyIcon,
  HelpOutline as HelpOutlineIcon,
} from '@mui/icons-material';
import { GeekEmptyState, GeekErrorState } from '@geeksuite/ui';
import ResponsiveTable from '../../components/primitives/ResponsiveTable';
import AliveModelPicker from './AliveModelPicker';
import ProvidersBlock from './ProvidersBlock';
import { formatCost, formatTokens, formatWhen, formatAgo, parseWhen } from './format';
import { AUTOMATIC, PINNED, routingMode } from './useAIGeek';

const KeyName = (apiKey) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography variant="body2" sx={{ fontWeight: 600 }}>{apiKey.name}</Typography>
    {apiKey.description && (
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
        {apiKey.description}
      </Typography>
    )}
  </Box>
);

/** The key table for one group. Columns are the same at every width. */
function KeyTable({ keys, onCopy, onEdit, onRevoke }) {
  return (
    <ResponsiveTable
      rows={keys}
      rowKey={(apiKey) => apiKey.id}
      renderCardHeader={KeyName}
      columns={[
        { key: 'name', label: 'Name', card: false, render: KeyName },
        {
          key: 'keyPrefix',
          label: 'Prefix',
          render: (apiKey) => (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: { xs: 'flex-end', md: 'flex-start' } }}>
              <Typography variant="body2" sx={{ fontFamily: '"Geist Mono", monospace', fontSize: 12 }}>
                {apiKey.keyPrefix}…
              </Typography>
              <Tooltip title="Copy prefix">
                <IconButton size="small" onClick={() => onCopy(apiKey.keyPrefix)} sx={{ minWidth: 44, minHeight: 44 }}>
                  <CopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          ),
        },
        {
          key: 'permissions',
          label: 'Permissions',
          render: (apiKey) => (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: { xs: 'flex-end', md: 'flex-start' } }}>
              {(apiKey.permissions || []).map((perm) => (
                <Chip key={perm} label={perm.replace('ai:', '')} size="small" variant="outlined" sx={{ fontSize: 12 }} />
              ))}
            </Box>
          ),
        },
        {
          key: 'rateLimit',
          label: 'Rate limit',
          render: (apiKey) => (
            <Box sx={{ fontVariantNumeric: 'tabular-nums' }}>
              <Typography variant="body2" sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {apiKey.rateLimit?.requestsPerMinute ?? '—'}/min
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {apiKey.rateLimit?.requestsPerDay ?? '—'}/day
              </Typography>
            </Box>
          ),
        },
        {
          key: 'usage',
          label: 'Usage',
          render: (apiKey) => (
            <Box>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {(apiKey.usage?.totalRequests ?? 0).toLocaleString()} calls
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 12 }}>
                Last used {formatWhen(apiKey.usage?.lastUsed, 'never')}
              </Typography>
            </Box>
          ),
        },
        {
          key: 'status',
          label: 'Status',
          render: (apiKey) => (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: { xs: 'flex-end', md: 'flex-start' } }}>
              <Chip
                label={apiKey.isActive ? 'Active' : 'Inactive'}
                color={apiKey.isActive ? 'success' : 'default'}
                size="small"
                sx={{ fontSize: 12 }}
              />
              {apiKey.isExpired && <Chip label="Expired" color="error" size="small" sx={{ fontSize: 12 }} />}
              {!apiKey.isExpired && parseWhen(apiKey.expiresAt) && (
                <Chip
                  label={`Expires ${parseWhen(apiKey.expiresAt).toLocaleDateString()}`}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: 12 }}
                />
              )}
            </Box>
          ),
        },
      ]}
      renderActions={(apiKey) => (
        // A table cell lays two 44px buttons out vertically without this.
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Edit key">
            <IconButton size="small" onClick={() => onEdit(apiKey)} sx={{ minWidth: 44, minHeight: 44 }}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Revoke key">
            <IconButton size="small" color="error" onClick={() => onRevoke(apiKey)} sx={{ minWidth: 44, minHeight: 44 }}>
              <BlockIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    />
  );
}

/**
 * One app's routing, as three controls and a number.
 *
 * `Automatic | Pinned` is a segmented toggle rather than a select because
 * there are exactly two values and both fit on a phone; a two-option dropdown
 * is a click to find out what the options are.
 *
 * The two switches are disabled under Pinned rather than hidden — a pinned row
 * has already chosen its model, and a pin never spends through the governor,
 * so neither means anything there. Disabled says "not applicable"; hidden says
 * "gone".
 */
function RoutingControls({ group, saving, picker, onPatch }) {
  const config = group.config;
  const mode = routingMode(config?.tier);
  const pinned = mode === PINNED;

  return (
    <Box sx={{ mt: 1.5 }}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={mode}
        onChange={(_, value) => { if (value && value !== mode) onPatch({ tier: value }); }}
        aria-label={`Routing for ${group.appId}`}
        disabled={saving}
      >
        <ToggleButton value={AUTOMATIC} sx={{ minHeight: 44, px: 2, fontSize: 12 }}>Automatic</ToggleButton>
        <ToggleButton value={PINNED} sx={{ minHeight: 44, px: 2, fontSize: 12 }}>Pinned</ToggleButton>
      </ToggleButtonGroup>

      <Typography variant="caption" color="text.muted" display="block" sx={{ fontSize: 12, mt: 0.5 }}>
        {pinned
          ? 'Every call goes to the model below, alive or not.'
          : 'Health-ranked free rows first, then the paid fallback if allowed.'}
      </Typography>

      <Collapse in={pinned} unmountOnExit>
        <Box sx={{ mt: 1.5 }}>
          <AliveModelPicker
            groups={picker.groups}
            loading={picker.loading}
            error={picker.error}
            provider={config?.provider}
            model={config?.model}
            onPick={(provider, model) => onPatch({ tier: PINNED, provider, model })}
            onReload={picker.onReload}
            suggestOpen={picker.suggestApp === group.appId}
            onToggleSuggest={() => picker.onToggleSuggest(group.appId)}
            recommendTask={picker.recommendTask}
            recommendPriority={picker.recommendPriority}
            recommendations={picker.recommendations}
            recommending={picker.recommending}
            onTaskChange={picker.onTaskChange}
            onPriorityChange={picker.onPriorityChange}
            onRecommend={picker.onRecommend}
          />
        </Box>
      </Collapse>

      <Box sx={{ mt: 1 }}>
        <FormControlLabel
          sx={{ alignItems: 'flex-start', ml: 0 }}
          control={(
            <Switch
              checked={config?.sticky === 'per-conversation'}
              disabled={pinned || saving}
              onChange={(e) => onPatch({ sticky: e.target.checked ? 'per-conversation' : null })}
              inputProps={{ 'aria-label': `Sticky per conversation for ${group.appId}` }}
            />
          )}
          label={(
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2">Sticky per conversation</Typography>
              <Typography variant="caption" color="text.muted" sx={{ fontSize: 12 }}>
                Keeps one model for a whole conversation until it fails. Costs a slower
                first answer after a model dies; buys a voice that does not change mid-story.
              </Typography>
            </Box>
          )}
        />

        <FormControlLabel
          sx={{ alignItems: 'flex-start', ml: 0 }}
          control={(
            <Switch
              checked={config?.allowPaid === true}
              disabled={pinned || saving}
              onChange={(e) => onPatch({ allowPaid: e.target.checked })}
              inputProps={{ 'aria-label': `May spend for ${group.appId}` }}
            />
          )}
          label={(
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2">May spend</Typography>
              <Typography variant="caption" color="text.muted" sx={{ fontSize: 12 }}>
                Lets this app reach the paid fallback when every free row is exhausted,
                under the daily and per-call caps. Costs real money; off is right wherever
                the deterministic fallback is good enough.
              </Typography>
            </Box>
          )}
        />
      </Box>

      <TextField
        // Uncontrolled on purpose: the value is a number saved on blur, and the
        // server is the source of truth the moment it lands. `key` re-seeds the
        // box when a reload brings a different number back, which is the one
        // case a stale uncontrolled input would get wrong.
        key={`cap-${group.appId}-${config?.dailyCap ?? 'default'}`}
        type="number"
        label="Daily cap"
        defaultValue={config?.dailyCap ?? ''}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          const next = raw === '' ? null : parseInt(raw, 10);
          if ((config?.dailyCap ?? null) === (next ?? null)) return;
          onPatch({ dailyCap: next });
        }}
        disabled={saving}
        inputProps={{ min: 1, 'aria-label': `Daily cap for ${group.appId}` }}
        helperText="Feature calls per bucket per day. Blank uses the door's default of 200."
        sx={{ mt: 1, maxWidth: 280, '& .MuiInputBase-root': { minHeight: 44 } }}
      />
    </Box>
  );
}

/** One app: its routing, and every key filed under it. */
function AppGroupCard({ group, picker, saving, onEditRouting, onDeleteRouting, onPatchRouting, onMintKey, onCopy, onEditKey, onRevokeKey }) {
  const { config, keys, appId, displayName, isInternal, discovered, status } = group;

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ wordBreak: 'break-word' }}>{displayName}</Typography>
            {displayName !== appId && (
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: '"Geist Mono", monospace', fontSize: 12 }}>
                {appId}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {!config && <Chip size="small" variant="outlined" color="warning" label="unrouted" sx={{ fontSize: 12 }} />}
            {config?.enabled === false && (
              <Chip size="small" variant="outlined" label="Disabled" sx={{ fontSize: 12 }} />
            )}
            {isInternal && (
              <Tooltip title="Calls aiGeek in-process and presents no API key">
                <Chip size="small" variant="outlined" label="internal" sx={{ fontSize: 12 }} />
              </Tooltip>
            )}
            {discovered && !config && <Chip size="small" variant="outlined" label="seen in traffic" sx={{ fontSize: 12 }} />}
            {saving && <CircularProgress size={16} />}
          </Box>
        </Box>

        {(status?.lastCallAt || config?.lastSeen) && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 12, mt: 0.5 }}>
            Last call {formatAgo(status?.lastCallAt || config?.lastSeen)}
          </Typography>
        )}

        {config?.notes && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, fontSize: 12 }}>
            {config.notes}
          </Typography>
        )}

        <RoutingControls
          group={group}
          saving={saving}
          picker={picker}
          onPatch={(patch) => onPatchRouting(appId, patch)}
        />

        <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => onEditRouting(group)}
            sx={{ minHeight: 44, fontSize: 12 }}
          >
            {config ? 'More routing options' : 'Add routing'}
          </Button>
          {isInternal ? (
            // Deliberately not a chip: in a row of buttons an outlined pill
            // reads as one more thing to press, and there is nothing to press.
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minHeight: 44, color: 'text.muted' }}>
              <HelpOutlineIcon fontSize="small" />
              <Typography variant="body2" sx={{ fontSize: 12 }}>No key needed</Typography>
            </Box>
          ) : (
            <Button
              size="small"
              variant="contained"
              startIcon={<VpnKeyIcon />}
              onClick={() => onMintKey(appId)}
              sx={{ minHeight: 44, fontSize: 12 }}
            >
              Mint key
            </Button>
          )}
          {config && (
            <Button
              size="small"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => onDeleteRouting(config.appName)}
              sx={{ minHeight: 44, fontSize: 12 }}
            >
              Remove routing
            </Button>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {keys.length > 0 && (
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {keys.length} key{keys.length === 1 ? '' : 's'}
          </Typography>
        )}

        {keys.length === 0 ? (
          <GeekEmptyState
            compact
            title={isInternal ? 'No key, by design' : `No keys for ${appId}`}
            description={isInternal
              ? 'This app reaches aiGeek inside the suite and is attributed without a credential.'
              : 'Calls arriving without a key for this app land in Unattributed. Mint one to attribute them.'}
          />
        ) : (
          <KeyTable keys={keys} onCopy={onCopy} onEdit={onEditKey} onRevoke={onRevokeKey} />
        )}
      </CardContent>
    </Card>
  );
}

/** What arrived with no key and no app claim. Omitted entirely when unknown. */
function UnattributedCard({ usage }) {
  const { total, byProvider } = usage;
  return (
    <Card variant="outlined" sx={{ borderStyle: 'dashed' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h6">Unattributed</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
              Calls that arrived with no key and no app to resolve
            </Typography>
          </Box>
          <Chip size="small" color="warning" variant="outlined" label={`${total.calls.toLocaleString()} calls`} sx={{ fontSize: 12 }} />
        </Box>

        <Box sx={{ mt: 1.5, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
            {formatTokens(total.tokens)} tokens
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
            {formatCost(total.cost)}
          </Typography>
          <Typography variant="body2" sx={{ color: 'success.main', fontSize: 12 }}>
            {total.freeCalls.toLocaleString()} free
          </Typography>
          <Typography variant="body2" sx={{ color: 'warning.main', fontSize: 12 }}>
            {total.paidCalls.toLocaleString()} paid
          </Typography>
        </Box>

        <Box sx={{ mt: 1.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {byProvider.map((row) => (
            <Chip
              key={row.provider}
              size="small"
              variant="outlined"
              label={`${row.provider} · ${(row.calls || 0).toLocaleString()}`}
              sx={{ fontSize: 12, textTransform: 'capitalize' }}
            />
          ))}
        </Box>

        <Alert severity="info" sx={{ mt: 2, fontSize: 12 }}>
          Mint a key for whatever is making these calls and point it at the app it belongs
          to — routing and cost only follow a caller aiGeek can name.
        </Alert>
      </CardContent>
    </Card>
  );
}

export default function AppsKeysPanel({
  appGroups,
  unattributedUsage,
  discoveredApps,
  loading,
  error,
  newAppName,
  savingApp,
  picker,
  providers,
  onNewAppNameChange,
  onRefresh,
  onAddApp,
  onEditRouting,
  onDeleteRouting,
  onPatchRouting,
  onMintKey,
  onCopy,
  onEditKey,
  onRevokeKey,
}) {
  const unrouted = discoveredApps.filter(
    (appName) => !appGroups.some((group) => group.appId === appName.toLowerCase() && group.config)
  );

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6">Apps and keys</Typography>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={onRefresh}
            disabled={loading}
            sx={{ minHeight: 44 }}
          >
            Refresh
          </Button>
        </Box>

        <Alert severity="info" sx={{ mb: 2, fontSize: 12 }}>
          aiGeek names the caller from the API key&apos;s own <code>appName</code>, lowercased.
          An <code>appName</code> in the request body is ignored, so routing and cost follow the
          key rather than whatever the client claimed to be.
        </Alert>

        {error ? (
          <GeekErrorState title="Couldn't load apps and keys" error={error} onRetry={onRefresh} />
        ) : loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
        ) : (
          <>
            {unrouted.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Seen in traffic, not yet routed</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {unrouted.map((appName) => (
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
                placeholder="e.g. mynewgeek"
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

            {appGroups.length === 0 ? (
              <GeekEmptyState
                title="No apps yet"
                description="An app appears here as soon as it has an API key, a routing row, or a call on record."
              />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {appGroups.map((group) => (
                  <AppGroupCard
                    key={group.appId}
                    group={group}
                    picker={picker}
                    saving={savingApp === group.appId}
                    onEditRouting={onEditRouting}
                    onDeleteRouting={onDeleteRouting}
                    onPatchRouting={onPatchRouting}
                    onMintKey={onMintKey}
                    onCopy={onCopy}
                    onEditKey={onEditKey}
                    onRevokeKey={onRevokeKey}
                  />
                ))}
                {unattributedUsage && <UnattributedCard usage={unattributedUsage} />}
              </Box>
            )}
          </>
        )}

        <Divider sx={{ my: 3 }} />

        <ProvidersBlock {...providers} />
      </CardContent>
    </Card>
  );
}
