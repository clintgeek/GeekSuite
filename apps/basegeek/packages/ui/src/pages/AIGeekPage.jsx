/**
 * AIGeekPage — the shell. Tabs, the hook, the dialogs.
 *
 * What used to be here: 2,216 lines holding twenty `useState`s, fourteen
 * handlers and five tabs' worth of JSX, with the free-tier editor and the
 * catalog both writing the same models through different mutations. The state
 * now lives in `aigeek/useAIGeek.js`, each tab is its own file, and the two
 * model tabs are one — see `aigeek/CatalogTab.jsx` for why they had to be.
 *
 * Four tabs: Configuration · Usage · Catalog · App Routing.
 *
 * The page is admin-only, gated by `RequireAdmin` in App.jsx and, where it
 * actually counts, by `requireAdminUser` on every mutation the server exposes.
 */
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
import AppRoutingTab from './aigeek/AppRoutingTab';
import AppConfigDialog from './aigeek/dialogs/AppConfigDialog';
import PricingDialog from './aigeek/dialogs/PricingDialog';
import FreeTierDialog from './aigeek/dialogs/FreeTierDialog';
import {
  ResetStatsDialog,
  ResetFreeTiersDialog,
  RestoreDefaultsDialog,
} from './aigeek/dialogs/ConfirmDialogs';

const TABS = [
  { label: 'Configuration', icon: <SettingsIcon /> },
  { label: 'Usage & Cost', icon: <AnalyticsIcon /> },
  { label: 'Catalog', icon: <KeyIcon /> },
  { label: 'App Routing', icon: <AppsIcon /> },
];

export default function AIGeekPage() {
  const { notify } = useToast();
  const theme = useTheme();
  // Same breakpoint the shell switches nav at, per MOBILE_UI_PLAN §2.
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));
  const aigeek = useAIGeek(notify);
  const { state, dispatch } = aigeek;

  const setConfirm = (which, open) => dispatch({ type: 'confirm/set', which, open });

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
        {TABS.map(tab => <Tab key={tab.label} label={tab.label} icon={tab.icon} sx={{ minHeight: 44 }} />)}
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

      {state.activeTab === 3 && (
        <AppRoutingTab
          appConfigs={state.appConfigs}
          discoveredApps={state.discoveredApps}
          appConfigsLoading={state.appConfigsLoading}
          appConfigsError={state.appConfigsError}
          newAppName={state.newAppName}
          onNewAppNameChange={(value) => dispatch({ type: 'apps/newName', value })}
          onRefresh={aigeek.loadAppConfigs}
          onAddApp={(appName) => {
            aigeek.addDiscoveredApp(appName);
            dispatch({ type: 'apps/newName', value: '' });
          }}
          onEdit={(app) => dispatch({ type: 'appDialog/open', value: { ...app } })}
          onDelete={aigeek.deleteAppConfig}
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
