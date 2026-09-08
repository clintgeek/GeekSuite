/**
 * AppConfigDialog — one app's routing, plus the model steward that fills it in.
 *
 * The steward block moved to `../ModelStewardBlock.jsx` when the Apps & keys
 * tab grew an inline copy of it: same questions, same answers, two hosts. This
 * dialog's version writes into the open draft (`onPatch` via `onPickModel`),
 * the tab's writes straight to the saved routing row.
 *
 * It sits on `ConsoleDialog` (and so on `GeekDialog`) rather than a bare MUI
 * `Dialog`: this form is tall, it is now reached from the Apps & keys tab on a
 * phone, and a windowed dialog at 390px put a two-line title, a steward block
 * and a footer into about 60% of the viewport. Full-screen below `sm` is the
 * suite rule (MOBILE_UI_PLAN §4b) and the primitive already owns it.
 *
 * Both write `tier: 'specific'` along with the provider and model, because
 * `specific` is the only tier the router reads provider/model from; saving a
 * choice while the tier stayed `auto` would put it in a field nothing looks at.
 *
 * Phase 2 (DOCS/AIGEEK_FRONT_DOOR.md) collapsed the routing tiers to `auto`
 * and `specific` and added the two switches at the bottom. This is the
 * *minimal* version of that: Phase 3 redesigns this whole page into a status
 * page, so the controls are here to be reachable, not to be beautiful.
 */
import { Box, Button, FormControlLabel, Grid, Switch, TextField } from '@mui/material';
import ConsoleDialog from '../../../components/primitives/ConsoleDialog';
import ModelStewardBlock from '../ModelStewardBlock';

export default function AppConfigDialog({
  editing,
  providers,
  freeModels,
  freeModelsLoading,
  recommendTask,
  recommendPriority,
  recommendations,
  recommending,
  onPatch,
  onTaskChange,
  onPriorityChange,
  onRecommend,
  onPickModel,
  onLoadFreeModels,
  onCancel,
  onSave,
}) {
  const isPinned = (provider, modelId) =>
    editing?.tier === 'specific' && editing?.provider === provider && editing?.model === modelId;

  return (
    <ConsoleDialog
      open={!!editing}
      onClose={onCancel}
      eyebrow="Routing"
      title={editing?.appName ? `Configure — ${editing.appName}` : 'New app config'}
      primaryAction={<Button variant="contained" onClick={onSave} sx={{ minHeight: 44 }}>Save</Button>}
      secondaryAction={<Button onClick={onCancel} sx={{ minHeight: 44 }}>Cancel</Button>}
    >
      <Box sx={{ pt: 0.5 }}>
        <TextField
          fullWidth
          label="Display name"
          value={editing?.displayName ?? ''}
          onChange={(e) => onPatch({ displayName: e.target.value })}
          margin="normal"
        />

        <TextField
          fullWidth
          select
          label="Routing tier"
          // A row still stored as `free` or `rotation` shows as Automatic,
          // which is what it now does. Saving rewrites it (the GraphQL
          // resolver normalizes), so the legacy values drain away as rows are
          // touched rather than needing a migration.
          value={editing?.tier === 'specific' ? 'specific' : 'auto'}
          onChange={(e) => onPatch({ tier: e.target.value })}
          margin="normal"
          SelectProps={{ native: true }}
        >
          <option value="auto">Automatic — health-ranked free rows, then paid if allowed</option>
          <option value="specific">Specific — pinned provider/model</option>
        </TextField>

        {editing?.tier === 'specific' && (
          <>
            <TextField
              fullWidth
              select
              label="Provider"
              value={editing?.provider ?? ''}
              onChange={(e) => onPatch({ provider: e.target.value })}
              margin="normal"
              SelectProps={{ native: true }}
              // Empty value + native select = the label sits on top of the
              // first option. Keep it shrunk.
              InputLabelProps={{ shrink: true }}
            >
              <option value="">Select provider…</option>
              {providers.map(p => <option key={p} value={p}>{p}</option>)}
            </TextField>
            <TextField
              fullWidth
              label="Model ID"
              value={editing?.model ?? ''}
              onChange={(e) => onPatch({ model: e.target.value })}
              margin="normal"
              helperText="Exact model ID from the Catalog tab"
            />
          </>
        )}

        <ModelStewardBlock
          sx={{ mt: 2 }}
          freeModels={freeModels}
          freeModelsLoading={freeModelsLoading}
          recommendTask={recommendTask}
          recommendPriority={recommendPriority}
          recommendations={recommendations}
          recommending={recommending}
          isPinned={isPinned}
          onTaskChange={onTaskChange}
          onPriorityChange={onPriorityChange}
          onRecommend={onRecommend}
          onPickModel={onPickModel}
          onLoadFreeModels={onLoadFreeModels}
        />

        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Max tokens (optional)"
              type="number"
              value={editing?.maxTokens ?? ''}
              onChange={(e) => onPatch({ maxTokens: e.target.value })}
              size="small"
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Temperature (optional)"
              type="number"
              inputProps={{ step: '0.1', min: '0', max: '2' }}
              value={editing?.temperature ?? ''}
              onChange={(e) => onPatch({ temperature: e.target.value })}
              size="small"
            />
          </Grid>
        </Grid>

        <TextField
          fullWidth
          label="Notes"
          value={editing?.notes ?? ''}
          onChange={(e) => onPatch({ notes: e.target.value })}
          margin="normal"
          multiline
          rows={2}
        />

        <FormControlLabel
          control={(
            <Switch
              checked={editing?.enabled !== false}
              onChange={(e) => onPatch({ enabled: e.target.checked })}
            />
          )}
          label="Enabled"
        />

        {/*
          Sticky picks and the paid fallback: the two Phase 2 controls. Both
          only mean anything under Automatic — a pinned row has already chosen
          its model, and a pin never spends through the governor — so they are
          disabled rather than hidden there, which says "not applicable"
          instead of "gone".
        */}
        <FormControlLabel
          control={(
            <Switch
              checked={editing?.sticky === 'per-conversation'}
              disabled={editing?.tier === 'specific'}
              onChange={(e) => onPatch({ sticky: e.target.checked ? 'per-conversation' : null })}
            />
          )}
          label="Sticky per conversation — keep one model per conversation until it fails"
        />

        <FormControlLabel
          control={(
            <Switch
              checked={editing?.allowPaid === true}
              disabled={editing?.tier === 'specific'}
              onChange={(e) => onPatch({ allowPaid: e.target.checked })}
            />
          )}
          label="Allow paid fallback — only when every free row is exhausted, under the daily cap"
        />
      </Box>
    </ConsoleDialog>
  );
}
