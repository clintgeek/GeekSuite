/**
 * AppsKeysTab — one page for "who is calling, and where do their calls go".
 *
 * This replaces the old App Routing tab and the standalone API Keys page,
 * which were two views of the same fact filed apart. aiGeek now resolves the
 * caller from the API key's own `appName` — normalized lowercase, with the
 * request body's `appName` ignored — so a key *is* an app's identity, and the
 * routing row that decides which model answers belongs directly under it. The
 * two screens could not be kept honest separately: an admin could revoke the
 * last key for an app on one page and leave a routing row on the other
 * pointing at a caller that no longer exists.
 *
 * A group is an app id, and it can arrive from three directions: a key filed
 * under it, a routing row naming it, or traffic seen from it with neither yet.
 * `startgeek` is the interesting case — it calls in-process and presents no
 * key, so it renders with an "internal" chip where the others get Mint.
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
  IconButton,
  TextField,
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
  AutoAwesome as AutoAwesomeIcon,
  HelpOutline as HelpOutlineIcon,
} from '@mui/icons-material';
import { GeekEmptyState, GeekErrorState } from '@geeksuite/ui';
import ResponsiveTable from '../../components/primitives/ResponsiveTable';
import ModelStewardBlock from './ModelStewardBlock';
import { formatCost, formatTokens, formatWhen, parseWhen } from './format';

/** The one-line description of where an app's calls actually go. */
const routingLine = (config) => {
  if (!config) return 'No routing row — falls back to the default rotation';
  if (config.tier === 'specific') return `${config.provider}/${config.model}`;
  if (config.tier === 'free') return 'Free-tier rotation';
  if (config.tier === 'rotation') return 'All-provider rotation';
  return null;
};

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

/** One app: its routing row, its steward, and every key filed under it. */
function AppGroupCard({ group, steward, onEditRouting, onDeleteRouting, onMintKey, onCopy, onEditKey, onRevokeKey }) {
  const { config, keys, appId, displayName, isInternal, discovered } = group;
  const stewardOpen = steward.openApp === appId;

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
            {config ? (
              <>
                <Chip
                  size="small"
                  label={config.tier}
                  color={config.tier === 'free' ? 'success' : config.tier === 'specific' ? 'primary' : 'default'}
                  sx={{ fontSize: 12 }}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={config.enabled === false ? 'Disabled' : 'Enabled'}
                  color={config.enabled === false ? 'default' : 'success'}
                  sx={{ fontSize: 12 }}
                />
              </>
            ) : (
              <Chip size="small" variant="outlined" color="warning" label="unrouted" sx={{ fontSize: 12 }} />
            )}
            {isInternal && (
              <Tooltip title="Calls aiGeek in-process and presents no API key">
                <Chip size="small" variant="outlined" label="internal" sx={{ fontSize: 12 }} />
              </Tooltip>
            )}
            {discovered && !config && <Chip size="small" variant="outlined" label="seen in traffic" sx={{ fontSize: 12 }} />}
          </Box>
        </Box>

        <Typography
          variant="body2"
          color={config?.tier === 'specific' ? 'text.primary' : 'text.secondary'}
          sx={{ mt: 1, wordBreak: 'break-all' }}
        >
          {routingLine(config)}
        </Typography>

        {config?.notes && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, fontSize: 12 }}>
            {config.notes}
          </Typography>
        )}

        {config?.lastSeen && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 12 }}>
            Last seen {formatWhen(config.lastSeen, 'never')}
          </Typography>
        )}

        <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => onEditRouting(group)}
            sx={{ minHeight: 44 }}
          >
            {config ? 'Edit routing' : 'Add routing'}
          </Button>
          <Button
            size="small"
            startIcon={<AutoAwesomeIcon />}
            onClick={() => steward.onToggle(appId)}
            sx={{ minHeight: 44 }}
          >
            {stewardOpen ? 'Hide steward' : 'Recommend a model'}
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
              sx={{ minHeight: 44 }}
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
              sx={{ minHeight: 44 }}
            >
              Remove routing
            </Button>
          )}
        </Box>

        <Collapse in={stewardOpen} unmountOnExit>
          <ModelStewardBlock
            sx={{ mt: 2 }}
            freeModels={steward.freeModels}
            freeModelsLoading={steward.freeModelsLoading}
            recommendTask={steward.recommendTask}
            recommendPriority={steward.recommendPriority}
            recommendations={steward.recommendations}
            recommending={steward.recommending}
            isPinned={(provider, modelId) =>
              config?.tier === 'specific' && config?.provider === provider && config?.model === modelId}
            onTaskChange={steward.onTaskChange}
            onPriorityChange={steward.onPriorityChange}
            onRecommend={steward.onRecommend}
            onPickModel={(provider, modelId) => steward.onPickModel(appId, provider, modelId)}
            onLoadFreeModels={steward.onLoadFreeModels}
          />
        </Collapse>

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

export default function AppsKeysTab({
  appGroups,
  unattributedUsage,
  discoveredApps,
  loading,
  error,
  newAppName,
  steward,
  onNewAppNameChange,
  onRefresh,
  onAddApp,
  onEditRouting,
  onDeleteRouting,
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
          <Typography variant="h6">Apps &amp; keys</Typography>
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
                    steward={steward}
                    onEditRouting={onEditRouting}
                    onDeleteRouting={onDeleteRouting}
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
      </CardContent>
    </Card>
  );
}
