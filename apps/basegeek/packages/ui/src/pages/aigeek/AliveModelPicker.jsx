/**
 * AliveModelPicker — the only way this console names a model.
 *
 * "Model ids are not sacred" (D3 in DOCS/AIGEEK_ELEVATION_PLAN.md): no human
 * types one, here or in a consumer's env var. So there is no text field on
 * this control at all — the vocabulary is exactly what `GET /api/ai/models/alive`
 * returned, which is the same health-ranked view *selection* reads, so the
 * picker and the router cannot disagree about what answers today.
 *
 * A native `<select>` with `<optgroup>` rather than MUI's Select: it groups
 * free rows from the governed paid fallback (the one split that changes what a
 * pick costs), it is the right control on a phone, and it cannot be coaxed
 * into accepting a value that is not in the list.
 *
 * The rows carry `{ provider, modelId, fitness, paid, lastSuccessAt }` and
 * nothing else — no display name, no capability matrix. `structured` is the
 * fitness worth surfacing: every AI feature in the suite asks for structured
 * output, so those rows sort first and say so in the option text.
 *
 * `Suggest` is what is left of the model steward (§3). It asks
 * `aiRecommendModel` "which model fits this job?" and offers the answers as
 * pins. Note the seam: the recommender ranks the *catalog*, so it can suggest
 * a row that is not in the alive list above. That is still a legal pin — a pin
 * is honoured whether or not the catalog currently believes in it — but it is
 * why the picker's own list, not the suggestion, is the authority on "alive".
 */
import {
  Box,
  Button,
  Chip,
  Collapse,
  TextField,
  Typography,
} from '@mui/material';
import { AutoAwesome as AutoAwesomeIcon } from '@mui/icons-material';
import { GeekEmptyState } from '@geeksuite/ui';
import ModelStewardBlock from './ModelStewardBlock';
import { formatAgo } from './format';

/**
 * `groq::llama-3.3-70b` — the value one option carries.
 *
 * Not exported: a non-component export out of a component module breaks fast
 * refresh (the lint config says so), and nothing outside this file needs to
 * build one. The tests assert the literal strings, which is the contract.
 */
const pickValue = (provider, modelId) => `${provider}::${modelId}`;

/** The option text: what answers, and how well. */
const optionLabel = (row) => {
  const parts = [`${row.provider} / ${row.modelId}`];
  if (row.fitness) parts.push(row.fitness);
  return parts.join(' · ');
};

export default function AliveModelPicker({
  groups,
  loading,
  error,
  provider,
  model,
  onPick,
  onReload,
  // Suggest — omit every one of these and the button is not rendered.
  suggestOpen,
  onToggleSuggest,
  recommendTask,
  recommendPriority,
  recommendations,
  recommending,
  onTaskChange,
  onPriorityChange,
  onRecommend,
  label = 'Pinned model',
}) {
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const current = provider && model ? pickValue(provider, model) : '';
  // A pin the alive list no longer carries. Keeping it selectable is the
  // point: a row that went quiet this hour is not a reason to silently
  // repoint an app, and the chip below says what happened.
  const currentIsAlive = groups.some(group =>
    group.rows.some(row => pickValue(row.provider, row.modelId) === current));
  const lastSuccess = groups
    .flatMap(group => group.rows)
    .find(row => pickValue(row.provider, row.modelId) === current)?.lastSuccessAt;

  if (!loading && total === 0) {
    return (
      <GeekEmptyState
        compact
        title="No model is answering right now"
        description={error
          ? "The alive list could not be read. Paste a provider key below, or try again."
          : 'Paste a key for a provider with a free tier below; the catalog job probes it and rows appear here.'}
        action={<Button onClick={onReload} sx={{ minHeight: 44 }}>Try again</Button>}
      />
    );
  }

  return (
    <Box>
      <TextField
        fullWidth
        select
        label={label}
        value={current}
        onChange={(event) => {
          const [pickedProvider, ...rest] = event.target.value.split('::');
          onPick(pickedProvider, rest.join('::'));
        }}
        SelectProps={{ native: true }}
        // A native select always shows its first option, so the label has to
        // stay shrunk or it sits on top of "Choose a model…".
        InputLabelProps={{ shrink: true }}
        disabled={loading}
        helperText={loading
          ? 'Reading the alive list…'
          : `${total} model${total === 1 ? '' : 's'} answering right now`}
        sx={{ '& .MuiInputBase-root': { minHeight: 44 } }}
      >
        <option value="">Choose a model…</option>
        {/* A pin whose row has gone quiet still needs an option to be the
            select's value, or the field renders blank and the next change
            event silently rewrites the row. */}
        {current && !currentIsAlive && (
          <option value={current}>{`${provider} / ${model} · not answering`}</option>
        )}
        {groups.map(group => (
          <optgroup key={group.key} label={group.label}>
            {group.rows.map(row => (
              <option key={pickValue(row.provider, row.modelId)} value={pickValue(row.provider, row.modelId)}>
                {optionLabel(row)}
              </option>
            ))}
          </optgroup>
        ))}
      </TextField>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 1 }}>
        {current && (
          <Chip
            size="small"
            variant="outlined"
            color={currentIsAlive ? 'success' : 'warning'}
            label={currentIsAlive ? `last answered ${formatAgo(lastSuccess)}` : 'not answering'}
            sx={{ fontSize: 12 }}
          />
        )}
        {onToggleSuggest && (
          <Button
            size="small"
            onClick={onToggleSuggest}
            startIcon={<AutoAwesomeIcon />}
            sx={{ minHeight: 44, fontSize: 12 }}
          >
            {suggestOpen ? 'Hide suggestions' : 'Suggest'}
          </Button>
        )}
      </Box>

      {onToggleSuggest && (
        <Collapse in={!!suggestOpen} unmountOnExit>
          <ModelStewardBlock
            sx={{ mt: 1.5 }}
            recommendTask={recommendTask}
            recommendPriority={recommendPriority}
            recommendations={recommendations}
            recommending={recommending}
            isPinned={(pickedProvider, modelId) => pickedProvider === provider && modelId === model}
            onTaskChange={onTaskChange}
            onPriorityChange={onPriorityChange}
            onRecommend={onRecommend}
            onPickModel={onPick}
          />
        </Collapse>
      )}
    </Box>
  );
}
