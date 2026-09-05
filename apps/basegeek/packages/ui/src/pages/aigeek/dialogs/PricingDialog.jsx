/**
 * PricingDialog — one model's input and output price.
 *
 * Prices are per 1,000,000 tokens, which is what the AIPricing collection
 * stores and what the catalog renders. It is deliberately not the per-1K
 * blended rate `aiService` keeps for cost estimates; the two units live side by
 * side in this system and mixing them is a factor-of-a-thousand mistake.
 */
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';

export default function PricingDialog({ editing, onPatch, onCancel, onSave }) {
  return (
    <Dialog open={!!editing} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Edit pricing — {editing?.modelName}</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2, fontSize: 12 }}>
          {editing?.provider} / {editing?.modelId}
        </Typography>
        <TextField
          fullWidth
          label="Input price (per 1M tokens)"
          type="number"
          inputProps={{ step: '0.0001', min: '0' }}
          value={editing?.inputPrice ?? ''}
          onChange={(e) => onPatch({ inputPrice: e.target.value })}
          margin="normal"
        />
        <TextField
          fullWidth
          label="Output price (per 1M tokens)"
          type="number"
          inputProps={{ step: '0.0001', min: '0' }}
          value={editing?.outputPrice ?? ''}
          onChange={(e) => onPatch({ outputPrice: e.target.value })}
          margin="normal"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} sx={{ minHeight: 44 }}>Cancel</Button>
        <Button variant="contained" onClick={onSave} sx={{ minHeight: 44 }}>Save pricing</Button>
      </DialogActions>
    </Dialog>
  );
}
