/**
 * AIGeekPage — the shell. Tabs, the hook, the dialogs.
 *
 * What used to be here: 2,216 lines holding twenty `useState`s, fourteen
 * handlers and five tabs' worth of JSX, with the free-tier editor and the
 * catalog both writing the same models through different mutations. The state
 * now lives in `aigeek/useAIGeek.js`, each tab is its own file, and the two
 * model tabs are one — see `aigeek/CatalogTab.jsx` for why they had to be.
 *
 * Four tabs: Configuration · Usage & Cost · Apps & keys · Catalog.
 *
 * "Apps & keys" is what App Routing and the old standalone API Keys page
 * became once aiGeek started resolving the caller from the key's `appName`
 * rather than from a body field. `/api-keys` redirects here — see App.jsx.
 *
 * The page is admin-only, gated by `RequireAdmin` in App.jsx and, where it
 * actually counts, by `requireAdminUser` on every mutation the server exposes.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Tab, Tabs, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Settings as SettingsIcon,
  Analytics as AnalyticsIcon,
  Key as KeyIcon,
  Apps as AppsIcon,
} from '@mui/icons-material';
import { useToast } from '@geeksuite/ui';
import { useAIGeek, CONFIG_PROVIDERS } from './aigeek/useAIGeek';
import ConfigurationTab from './aigeek/ConfigurationTab';
import UsageTab from './aigeek/UsageTab';
import CatalogTab from './aigeek/CatalogTab';
import AppsKeysTab from './aigeek/AppsKeysTab';
import AppConfigDialog from './aigeek/dialogs/AppConfigDialog';
import APIKeyDialog, { NewKeyDialog } from './aigeek/dialogs/APIKeyDialog';
import PricingDialog from './aigeek/dialogs/PricingDialog';
import FreeTierDialog from './aigeek/dialogs/FreeTierDialog';
import {
  ResetStatsDialog,
  ResetFreeTiersDialog,
  RestoreDefaultsDialog,
  RevokeKeyDialog,
} from './aigeek/dialogs/ConfirmDialogs';

/**
 * `slug` is what `?tab=` accepts. It exists so the retired `/api-keys` route
 * can redirect to a tab rather than to a page that no longer has one, and so
 * a link to a specific tab survives being pasted into a ticket.
 */
const TABS = [
  { slug: 'configuration', label: 'Configuration', icon: <SettingsIcon /> },
  { slug: 'usage', label: 'Usage & Cost', icon: <AnalyticsIcon /> },
  { slug: 'keys', label: 'Apps & keys', icon: <AppsIcon /> },
  { slug: 'catalog', label: 'Catalog', icon: <KeyIcon /> },
];

export default function AIGeekPage() {
  const { notify } = useToast();
  const theme = useTheme();
  // Same breakpoint the shell switches nav at, per MOBILE_UI_PLAN §2.
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));
  const aigeek = useAIGeek(notify);
  const { state, dispatch } = aigeek;
  const [searchParams, setSearchParams] = useSearchParams();

  const setConfirm = (which, open) => dispatch({ type: 'confirm/set', which, open });

  // `?tab=` is a starting point, not a binding: once the page is open the tabs
  // own the selection, so the param is consumed and dropped rather than kept
  // in sync with every click.
  const requestedTab = searchParams.get('tab');
  useEffect(() => {
    if (!requestedTab) return;
    const index = TABS.findIndex((tab) => tab.slug === requestedTab);
    if (index >= 0) dispatch({ type: 'tab/set', value: index });
    setSearchParams({}, { replace: true });
  }, [requestedTab, dispatch, setSearchParams]);

  /** Everything the shared steward block needs, in one prop. */
  const steward = {
    openApp: state.stewardApp,
    freeModels: state.freeModels,
    freeModelsLoading: state.freeModelsLoading,
    recommendTask: state.recommendTask,
    recommendPriority: state.recommendPriority,
    recommendations: state.recommendations,
    recommending: state.recommending,
    onToggle: aigeek.toggleSteward,
    onTaskChange: (value) => dispatch({ type: 'recommend/task', value }),
    onPriorityChange: (value) => dispatch({ type: 'recommend/priority', value }),
    onRecommend: aigeek.runRecommendation,
    onPickModel: aigeek.pinModelForApp,
    onLoadFreeModels: aigeek.loadFreeModels,
  };

  return (
    <Box>
      <Tabs
        value={state.activeTab}
        onChange={(_, value) => dispatch({ type: 'tab/set', value })}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 3 }}
      >
        {TABS.map(tab => <Tab key={tab.slug} label={tab.label} icon={tab.icon} sx={{ minHeight: 44 }} />)}
      </Tabs>

      {state.activeTab === 0 && (
        <ConfigurationTab
          config={state.config}
          configError={state.configError}
          loading={state.loading}
          onFieldChange={aigeek.setConfigField}
          onSave={aigeek.saveConfiguration}
          onTest={aigeek.testProvider}
          onRetry={aigeek.loadConfiguration}
        />
      )}

      {state.activeTab === 1 && (
        <UsageTab
          stats={state.stats}
          statsError={state.statsError}
          isCompact={isCompact}
          onRetry={aigeek.loadStatistics}
          onResetStats={() => setConfirm('showResetStatsConfirm', true)}
        />
      )}

      {state.activeTab === 2 && (
        <AppsKeysTab
          appGroups={aigeek.appGroups}
          unattributedUsage={aigeek.unattributedUsage}
          discoveredApps={state.discoveredApps}
          loading={state.appConfigsLoading || state.apiKeysLoading}
          error={state.appConfigsError || state.apiKeysError}
          newAppName={state.newAppName}
          steward={steward}
          onNewAppNameChange={(value) => dispatch({ type: 'apps/newName', value })}
          onRefresh={() => { aigeek.loadAppConfigs(); aigeek.loadApiKeys(); }}
          onAddApp={(appName) => {
            aigeek.addDiscoveredApp(appName);
            dispatch({ type: 'apps/newName', value: '' });
          }}
          onEditRouting={(group) => (group.config
            ? dispatch({ type: 'appDialog/open', value: { ...group.config } })
            : aigeek.addDiscoveredApp(group.appId))}
          onDeleteRouting={aigeek.deleteAppConfig}
          onMintKey={aigeek.openCreateKey}
          onCopy={aigeek.copyText}
          onEditKey={aigeek.openEditKey}
          onRevokeKey={(apiKey) => dispatch({ type: 'keys/revokeOpen', value: apiKey })}
        />
      )}

      {state.activeTab === 3 && (
        <CatalogTab
          directorData={state.directorData}
          directorLoading={state.directorLoading}
          directorError={state.directorError}
          syncingProvider={state.syncingProvider}
          savingBulk={state.savingBulk}
          dirtyCount={aigeek.dirtyCount}
          isCompact={isCompact}
          modelFreeTier={aigeek.modelFreeTier}
          isModelDirty={aigeek.isModelDirty}
          onRefresh={aigeek.loadDirectorData}
          onSync={aigeek.syncProviderModels}
          onFlag={(provider, modelId, value) =>
            dispatch({ type: 'freeTier/flag', provider, modelId, value })}
          onLimit={(provider, modelId, field, value) =>
            dispatch({ type: 'freeTier/limit', provider, modelId, field, value })}
          onSaveAll={aigeek.saveAllFreeTiers}
          onResetAll={() => setConfirm('showResetConfirm', true)}
          onRestoreDefaults={() => setConfirm('showRestoreDefaultsConfirm', true)}
          onEditPricing={aigeek.openPricingDialog}
          onEditFreeTier={aigeek.openFreeTierDialog}
        />
      )}

      <AppConfigDialog
        editing={state.editingApp}
        providers={CONFIG_PROVIDERS}
        freeModels={state.freeModels}
        freeModelsLoading={state.freeModelsLoading}
        recommendTask={state.recommendTask}
        recommendPriority={state.recommendPriority}
        recommendations={state.recommendations}
        recommending={state.recommending}
        onPatch={(patch) => dispatch({ type: 'appDialog/patch', patch })}
        onTaskChange={(value) => dispatch({ type: 'recommend/task', value })}
        onPriorityChange={(value) => dispatch({ type: 'recommend/priority', value })}
        onRecommend={aigeek.runRecommendation}
        onPickModel={aigeek.pickModel}
        onLoadFreeModels={aigeek.loadFreeModels}
        onCancel={() => dispatch({ type: 'appDialog/close' })}
        onSave={aigeek.saveAppConfig}
      />

      <APIKeyDialog
        editing={state.editingKey}
        saving={state.savingKey}
        onPatch={aigeek.patchKey}
        onPatchRate={aigeek.patchKeyRate}
        onCancel={aigeek.closeKeyDialog}
        onSave={aigeek.saveApiKey}
      />

      <NewKeyDialog
        apiKey={state.newKeyPlaintext}
        onCopy={aigeek.copyText}
        onClose={() => dispatch({ type: 'keys/mintedDismissed' })}
      />

      <RevokeKeyDialog
        apiKey={state.revokingKey}
        busy={state.revoking}
        onCancel={() => dispatch({ type: 'keys/revokeClose' })}
        onConfirm={aigeek.revokeApiKey}
      />

      <PricingDialog
        editing={state.editingPricing}
        onPatch={(patch) => dispatch({ type: 'pricing/patch', patch })}
        onCancel={() => dispatch({ type: 'pricing/close' })}
        onSave={aigeek.savePricing}
      />

      <FreeTierDialog
        editing={state.editingFreeTier}
        onPatch={(patch) => dispatch({ type: 'freeTierDialog/patch', patch })}
        onPatchLimit={(field, value) => dispatch({ type: 'freeTierDialog/limit', field, value })}
        onCancel={() => dispatch({ type: 'freeTierDialog/close' })}
        onSave={aigeek.saveFreeTier}
      />

      <ResetStatsDialog
        open={state.showResetStatsConfirm}
        onCancel={() => setConfirm('showResetStatsConfirm', false)}
        onConfirm={aigeek.resetStatistics}
      />
      <ResetFreeTiersDialog
        open={state.showResetConfirm}
        busy={state.savingBulk}
        onCancel={() => setConfirm('showResetConfirm', false)}
        onConfirm={aigeek.resetAllFreeTiers}
      />
      <RestoreDefaultsDialog
        open={state.showRestoreDefaultsConfirm}
        busy={state.savingBulk}
        onCancel={() => setConfirm('showRestoreDefaultsConfirm', false)}
        onConfirm={aigeek.restoreHardcodedDefaults}
      />
    </Box>
  );
}
