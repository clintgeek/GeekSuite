/**
 * AIGeekPage — the status page. One scroll, five sections, an anchor nav.
 *
 * What used to be here: 2,216 lines holding twenty `useState`s, fourteen
 * handlers and five tabs' worth of JSX, with the free-tier editor and the
 * catalog both writing the same models through different mutations. Then, for
 * two days, five tabs over `aigeek/useAIGeek.js`. Now, per
 * `DOCS/AIGEEK_STATUS_PAGE.md`: **Needs attention**, **Usage and cost**,
 * **Apps and keys**, then a collapsed **Catalog** and **Try it**.
 *
 * Why not tabs. Tabs say the sections are alternatives, and the whole point of
 * the redesign is the opposite: the page is read top to bottom, and the answer
 * a monthly visit wants — "is anything wrong" — has to be visible without
 * choosing anything. An empty first panel means close the tab.
 *
 * `?tab=` still works. `/api-keys` redirects to `/aigeek?tab=keys` (App.jsx),
 * links to a tab exist in tickets, and the mobile harness drives the page that
 * way; `TAB_SECTIONS` maps each retired slug onto the section that absorbed
 * it. The param is consumed and dropped, same as before — a starting point,
 * not a binding.
 *
 * The page is admin-only, gated by `RequireAdmin` in App.jsx and, where it
 * actually counts, by `requireAdminUser` on every mutation and route the
 * server exposes.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useToast } from '@geeksuite/ui';
import { useAIGeek } from './aigeek/useAIGeek';
import { SECTIONS, TAB_SECTIONS, normalizeAppId } from './aigeek/format';
import StatusNav from './aigeek/StatusNav';
import CollapsedSection from './aigeek/CollapsedSection';
import AttentionPanel from './aigeek/AttentionPanel';
import UsagePanel from './aigeek/UsagePanel';
import AppsKeysPanel from './aigeek/AppsKeysPanel';
import CatalogPanel from './aigeek/CatalogPanel';
import TestPromptPanel from './aigeek/TestPromptPanel';
import AppConfigDialog from './aigeek/dialogs/AppConfigDialog';
import APIKeyDialog, { NewKeyDialog } from './aigeek/dialogs/APIKeyDialog';
import { ResetStatsDialog, RevokeKeyDialog } from './aigeek/dialogs/ConfirmDialogs';

/** A section wrapper: the anchor id, and enough margin to clear a sticky bar. */
function Section({ id, children }) {
  return (
    <Box component="section" id={id} aria-label={SECTIONS.find(s => s.id === id)?.label} sx={{ scrollMarginTop: 88 }}>
      {children}
    </Box>
  );
}

export default function AIGeekPage() {
  const { notify } = useToast();
  const theme = useTheme();
  // Same breakpoint the shell switches nav at, per MOBILE_UI_PLAN §2.
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));
  const aigeek = useAIGeek(notify);
  const { state, dispatch } = aigeek;
  const [searchParams, setSearchParams] = useSearchParams();

  const { scrollToId } = aigeek;
  const requestedTab = searchParams.get('tab');
  // Once, ever. Consuming the param re-runs this effect with `requestedTab`
  // gone, and a cleanup that cancelled the pending scroll would mean the jump
  // never happened — which is how the `?tab=` compatibility quietly broke the
  // first time it was written.
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || !requestedTab) return;
    jumped.current = true;
    const sectionId = TAB_SECTIONS[requestedTab];
    setSearchParams({}, { replace: true });
    if (!sectionId) return;
    // A collapsed section cannot be scrolled to while it is collapsed.
    if (sectionId === 'catalog' || sectionId === 'try-it') {
      dispatch({ type: 'section/open', id: sectionId });
    }
    // The scroll has to wait for the anchor to exist: the section it names
    // renders behind a fetch, and a collapse that was just opened has not
    // mounted its body yet. One macrotask is enough, and a miss is a page
    // that opened at the top rather than an error.
    setTimeout(() => scrollToId(sectionId), 0);
  }, [requestedTab, dispatch, setSearchParams, scrollToId]);

  /**
   * Everything `AliveModelPicker` needs, in one prop, because it has two hosts
   * — the app card and the routing dialog — and a picker whose props drift
   * between them is a picker that behaves differently depending on how you
   * reached it.
   */
  const picker = {
    groups: aigeek.aliveGroups,
    loading: state.aliveLoading,
    error: state.aliveError,
    onReload: aigeek.loadAliveModels,
    suggestApp: state.suggestApp,
    onToggleSuggest: aigeek.toggleSuggest,
    recommendTask: state.recommendTask,
    recommendPriority: state.recommendPriority,
    recommendations: state.recommendations,
    recommending: state.recommending,
    onTaskChange: (value) => dispatch({ type: 'recommend/task', value }),
    onPriorityChange: (value) => dispatch({ type: 'recommend/priority', value }),
    onRecommend: aigeek.runRecommendation,
  };

  /** The daily cap for one app id, for the usage panel's feature lines. */
  const capsByApp = useMemo(() => {
    const caps = new Map();
    for (const row of state.appConfigs) caps.set(normalizeAppId(row.appName), row.dailyCap ?? null);
    return caps;
  }, [state.appConfigs]);

  const attentionCount = state.status?.attention?.length ?? 0;

  return (
    <Box>
      <StatusNav
        attentionCount={attentionCount}
        hasWarning={(state.status?.attention || []).some(item => item.severity === 'warn')}
        onJump={aigeek.scrollToId}
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Section id="needs-attention">
          <AttentionPanel
            status={state.status}
            statusError={state.statusError}
            statusLoading={state.statusLoading}
            discoveryRunning={state.discoveryRunning || state.status?.catalog?.running === true}
            onRetry={aigeek.loadStatus}
            onOpenProvider={aigeek.openProvider}
            onAddRouting={aigeek.addDiscoveredApp}
            onRotateKey={aigeek.openCreateKey}
            onRunDiscovery={aigeek.runDiscovery}
          />
        </Section>

        <Section id="usage">
          <UsagePanel
            stats={state.stats}
            statsError={state.statsError}
            spend={state.status?.spend}
            dailyCapFor={(appId) => capsByApp.get(appId) ?? null}
            isCompact={isCompact}
            onRetry={aigeek.loadStatistics}
            onResetStats={() => dispatch({ type: 'confirm/set', which: 'showResetStatsConfirm', open: true })}
          />
        </Section>

        <Section id="apps-keys">
          <AppsKeysPanel
            appGroups={aigeek.appGroups}
            unattributedUsage={aigeek.unattributedUsage}
            discoveredApps={state.discoveredApps}
            loading={state.appConfigsLoading || state.apiKeysLoading}
            error={state.appConfigsError || state.apiKeysError}
            newAppName={state.newAppName}
            savingApp={state.savingApp}
            picker={picker}
            providers={{
              config: state.config,
              configError: state.configError,
              savingProvider: state.savingProvider,
              status: state.status,
              onRetry: aigeek.loadConfiguration,
              onFieldChange: aigeek.setConfigField,
              onBlurSave: aigeek.saveProviderKey,
              onRemoveKey: aigeek.removeProviderKey,
            }}
            onNewAppNameChange={(value) => dispatch({ type: 'apps/newName', value })}
            onRefresh={() => { aigeek.loadAppConfigs(); aigeek.loadApiKeys(); }}
            onAddApp={(appName) => {
              aigeek.addDiscoveredApp(appName);
              dispatch({ type: 'apps/newName', value: '' });
            }}
            onEditRouting={aigeek.editAppConfig}
            onDeleteRouting={aigeek.deleteAppConfig}
            onPatchRouting={aigeek.patchAppConfig}
            onMintKey={aigeek.openCreateKey}
            onCopy={aigeek.copyText}
            onEditKey={aigeek.openEditKey}
            onRevokeKey={(apiKey) => dispatch({ type: 'keys/revokeOpen', value: apiKey })}
          />
        </Section>

        <Section id="catalog">
          <CollapsedSection
            id="catalog"
            title="Catalog (read-only)"
            description="Every model the catalog job knows about. It maintains this; you do not."
            open={state.openSections.catalog}
            onToggle={() => dispatch({ type: 'section/toggle', id: 'catalog' })}
          >
            <CatalogPanel
              rows={aigeek.catalogRows}
              loading={state.directorLoading}
              error={state.directorError}
              overrideRow={state.overrideRow}
              onRefresh={() => { aigeek.loadDirectorData(); aigeek.loadAliveModels(); }}
              onOpenOverride={(row) => dispatch({ type: 'override/open', value: row })}
              onCloseOverride={() => dispatch({ type: 'override/close' })}
              onSetOverride={aigeek.setCatalogOverride}
            />
          </CollapsedSection>
        </Section>

        <Section id="try-it">
          <CollapsedSection
            id="try-it"
            title="Try it"
            description="One prompt through the real route, to see who answers and what they say."
            open={state.openSections['try-it']}
            onToggle={() => dispatch({ type: 'section/toggle', id: 'try-it' })}
          >
            <TestPromptPanel picker={picker} />
          </CollapsedSection>
        </Section>
      </Box>

      <AppConfigDialog
        editing={state.editingApp}
        picker={picker}
        onPatch={(patch) => dispatch({ type: 'appDialog/patch', patch })}
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

      <ResetStatsDialog
        open={state.showResetStatsConfirm}
        onCancel={() => dispatch({ type: 'confirm/set', which: 'showResetStatsConfirm', open: false })}
        onConfirm={aigeek.resetStatistics}
      />
    </Box>
  );
}
