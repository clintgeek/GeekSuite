/**
 * ModelStewardBlock — "which model should answer for this app?"
 *
 * Phase 3 (§3) cut this to half its job. It used to be two halves: a
 * recommender ("which of the free rows fits this task?", `aiRecommendModel`)
 * and a browse list ("what is free right now?", `aiFreeModels`). The browse
 * list is gone — `AliveModelPicker` is that list now, and it reads the same
 * `/api/ai/models/alive` view that *selection* reads. Two model lists in one
 * control that could disagree about which rows are alive was the seam the old
 * page kept tearing along.
 *
 * What is left is the useful half, and it lives inside the Pinned picker
 * behind a "Suggest" button rather than on a tab of its own: free tiers move,
 * so a model that was the right pin in June is retired in August, and the
 * question "what should this app use?" is worth asking a ranker rather than
 * a memory.
 *
 * `onPickModel(provider, modelId)` is the caller's — the picker writes the pin
 * exactly as it would from its own select, so a suggestion and a hand-picked
 * row take the same path. `isPinned` is the caller's too, because "currently"
 * means the open draft in the routing dialog and the saved row on the app card.
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { AutoAwesome as AutoAwesomeIcon } from '@mui/icons-material';
import { formatContextWindow } from './format';

/** One ranked suggestion, clickable and keyboard-reachable. */
function RecommendationRow({ rec, selected, onPick }) {
  const theme = useTheme();
  return (
    <Box
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick();
        }
      }}
      sx={{
        minHeight: 44,
        p: 1.25,
        borderRadius: 1,
        cursor: 'pointer',
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? alpha(theme.palette.primary.main, 0.1) : 'background.paper',
        '&:hover': { borderColor: 'primary.main' },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{rec.name}</Typography>
        {typeof rec.score === 'number' && (
          <Chip
            size="small"
            label={`fit ${rec.score}`}
            color={selected ? 'primary' : 'default'}
            sx={{ fontSize: 12 }}
          />
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: 12 }}>
        {rec.provider} · {rec.modelId} · {formatContextWindow(rec.contextWindow)}
      </Typography>
      <Typography variant="caption" display="block" sx={{ fontSize: 12, mt: 0.5 }}>
        {rec.reasoning}
      </Typography>
    </Box>
  );
}

/**
 * @param {(provider: string, modelId: string) => boolean} isPinned
 *   Whether the row's model is the one this app currently routes to.
 */
export default function ModelStewardBlock({
  recommendTask,
  recommendPriority,
  recommendations,
  recommending,
  isPinned,
  onTaskChange,
  onPriorityChange,
  onRecommend,
  onPickModel,
  sx,
}) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        p: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: alpha(theme.palette.primary.main, 0.03),
        ...sx,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.25 }}>
        <AutoAwesomeIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2">Suggest a model</Typography>
      </Box>

      <TextField
        fullWidth
        label="What will this app ask the model to do?"
        placeholder="e.g. turn a search query into a JSON search plan"
        value={recommendTask}
        onChange={(e) => onTaskChange(e.target.value)}
        multiline
        rows={2}
        size="small"
        helperText="Prefilled from Notes. Mentioning JSON, tools, images or code narrows the ranking."
      />

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mt: 1.5 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={recommendPriority}
          onChange={(_, value) => { if (value) onPriorityChange(value); }}
          aria-label="Recommendation priority"
        >
          <ToggleButton value="cost" sx={{ minHeight: 44, px: 2, fontSize: 12 }}>Cost</ToggleButton>
          <ToggleButton value="speed" sx={{ minHeight: 44, px: 2, fontSize: 12 }}>Speed</ToggleButton>
          <ToggleButton value="quality" sx={{ minHeight: 44, px: 2, fontSize: 12 }}>Quality</ToggleButton>
        </ToggleButtonGroup>

        <Button
          variant="contained"
          onClick={onRecommend}
          disabled={recommending || !recommendTask.trim()}
          startIcon={recommending ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
          sx={{ minHeight: 44 }}
        >
          {recommending ? 'Asking…' : 'Recommend'}
        </Button>
      </Box>

      {recommendations && recommendations.length === 0 && (
        <Alert severity="warning" sx={{ mt: 1.5, fontSize: 12 }}>
          No model matched that description. Loosen the requirements, or pick one from
          the list above.
        </Alert>
      )}

      {recommendations && recommendations.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1.5 }}>
          {recommendations.map((rec) => (
            <RecommendationRow
              key={`${rec.provider}::${rec.modelId}`}
              rec={rec}
              selected={isPinned(rec.provider, rec.modelId)}
              onPick={() => onPickModel(rec.provider, rec.modelId)}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
