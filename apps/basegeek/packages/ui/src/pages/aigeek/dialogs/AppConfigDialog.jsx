/**
 * AppConfigDialog — one app's routing, for the fields the card does not carry.
 *
 * Phase 3 moved the controls a monthly visit actually touches — the routing
 * mode, the pin, the two switches, the daily cap — onto the app card itself,
 * where they write straight through. What is left for a dialog is the rest:
 * a display name, notes, the token and temperature overrides, and the Enabled
 * switch. It is also still the surface for an app with **no row yet**, which
 * is what the `unrouted_app` attention item's "Add routing" opens, prefilled
 * `tier: 'auto'` (§2).
 *
 * The card's controls and this dialog's are deliberately the same controls,
 * not two spellings of the same idea: the segmented `Automatic | Pinned`
 * toggle, and `AliveModelPicker` for the pin. The old "Model ID" text field is
 * gone — D3, nobody types a model id — and so is the provider select that fed
 * it, since a pick from the alive list carries its own provider.
 *
 * It sits on `ConsoleDialog` (and so on `GeekDialog`) rather than a bare MUI
 * `Dialog`: this form is tall, it is reached from a phone, and a windowed
 * dialog at 390px put a two-line title, a picker and a footer into about 60%
 * of the viewport. Full-screen below `sm` is the suite rule (MOBILE_UI_PLAN
 * §4b) and the primitive already owns it.
 */
import {
  Box,
  Button,
  Collapse,
  FormControlLabel,
  Grid,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ConsoleDialog from '../../../components/primitives/ConsoleDialog';
import AliveModelPicker from '../AliveModelPicker';
import { AUTOMATIC, PINNED, routingMode } from '../useAIGeek';

export default function AppConfigDialog({
  editing,
  picker,
  onPatch,
  onCancel,
  onSave,
}) {
  const mode = routingMode(editing?.tier);
  const pinned = mode === PINNED;

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

        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.muted" display="block" sx={{ fontSize: 12, mb: 0.5 }}>
            Routing
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={mode}
            // A row still stored as `free` or `rotation` reads as Automatic,
            // which is what it now does. Saving rewrites it (the GraphQL
            // resolver normalizes), so the legacy values drain away as rows
            // are touched rather than needing a migration.
            onChange={(_, value) => { if (value && value !== mode) onPatch({ tier: value }); }}
            aria-label="Routing tier"
          >
            <ToggleButton value={AUTOMATIC} sx={{ minHeight: 44, px: 2, fontSize: 12 }}>Automatic</ToggleButton>
            <ToggleButton value={PINNED} sx={{ minHeight: 44, px: 2, fontSize: 12 }}>Pinned</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.muted" display="block" sx={{ fontSize: 12, mt: 0.5 }}>
            {pinned
              ? 'Every call goes to the model below, alive or not.'
              : 'Health-ranked free rows first, then the paid fallback if allowed.'}
          </Typography>
        </Box>

        <Collapse in={pinned} unmountOnExit>
          <Box sx={{ mt: 2 }}>
            <AliveModelPicker
              groups={picker?.groups || []}
              loading={picker?.loading}
              error={picker?.error}
              provider={editing?.provider}
              model={editing?.model}
              onPick={(provider, model) => onPatch({ tier: PINNED, provider, model })}
              onReload={picker?.onReload}
              suggestOpen={picker?.suggestApp === editing?.appName}
              onToggleSuggest={picker?.onToggleSuggest
                ? () => picker.onToggleSuggest(editing?.appName)
                : undefined}
              recommendTask={picker?.recommendTask}
              recommendPriority={picker?.recommendPriority}
              recommendations={picker?.recommendations}
              recommending={picker?.recommending}
              onTaskChange={picker?.onTaskChange}
              onPriorityChange={picker?.onPriorityChange}
              onRecommend={picker?.onRecommend}
            />
          </Box>
        </Collapse>

        {/*
          Sticky picks and the paid fallback. Both only mean anything under
          Automatic — a pinned row has already chosen its model, and a pin
          never spends through the governor — so they are disabled rather than
          hidden there, which says "not applicable" instead of "gone".
        */}
        <FormControlLabel
          sx={{ mt: 1, alignItems: 'flex-start', ml: 0 }}
          control={(
            <Switch
              checked={editing?.sticky === 'per-conversation'}
              disabled={pinned}
              onChange={(e) => onPatch({ sticky: e.target.checked ? 'per-conversation' : null })}
            />
          )}
          label={(
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2">Sticky per conversation</Typography>
              <Typography variant="caption" color="text.muted" sx={{ fontSize: 12 }}>
                Keeps one model for a whole conversation until it fails.
              </Typography>
            </Box>
          )}
        />

        <FormControlLabel
          sx={{ alignItems: 'flex-start', ml: 0 }}
          control={(
            <Switch
              checked={editing?.allowPaid === true}
              disabled={pinned}
              onChange={(e) => onPatch({ allowPaid: e.target.checked })}
            />
          )}
          label={(
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2">May spend</Typography>
              <Typography variant="caption" color="text.muted" sx={{ fontSize: 12 }}>
                Allows the governed paid fallback when every free row is exhausted.
              </Typography>
            </Box>
          )}
        />

        <TextField
          fullWidth
          label="Daily cap"
          type="number"
          inputProps={{ min: 1 }}
          value={editing?.dailyCap ?? ''}
          onChange={(e) => onPatch({ dailyCap: e.target.value === '' ? null : e.target.value })}
          margin="normal"
          helperText="Feature calls per bucket per UTC day. Blank uses the door's default of 200."
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
          helperText="Also what the Suggest box is prefilled from."
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
      </Box>
    </ConsoleDialog>
  );
}
