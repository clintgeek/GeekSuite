import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, TextField } from '@mui/material';
import { settingsService } from '../../services/settingsService.js';

// JS getDay(): Sun=0..Sat=6 → Mon=0..Sun=6. Kept exactly as the Food log
// had it (`new Date('YYYY-MM-DD')` reads the day as UTC midnight); moving the
// page must not move which slot of the schedule is written.
const mondayFirstIndex = (dateStr) => (new Date(dateStr).getDay() + 6) % 7;

/**
 * "Change today's target": one number and Save, inside Today's "Macros and
 * details" (it used to be the Food log's gear). It writes this weekday's slot
 * of the plan's weekly schedule, never below the plan's safe minimum, and the
 * rest of the plan is left as it was.
 */
export default function DayTargetEditor({ day, goal = 0, onSaved }) {
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (goal > 0) setInput(String(Math.round(goal)));
  }, [goal]);

  const save = async () => {
    if (!input) return;
    setSaving(true);
    setFailed(false);
    try {
      const resp = await settingsService.getSettings();
      const data = resp?.data || resp;
      const ng = data?.nutrition_goal || {};
      const minSafe = ng?.min_safe_calories || 1200;
      const schedule = Array.isArray(ng?.weekly_schedule) && ng.weekly_schedule.length === 7
        ? [...ng.weekly_schedule]
        : new Array(7).fill(ng?.daily_calorie_target || Math.round(goal) || 0);
      schedule[mondayFirstIndex(day)] = Math.max(minSafe, Math.round(parseFloat(input)) || 0);
      await settingsService.updateSettings({
        nutrition_goal: { ...ng, enabled: true, weekly_schedule: schedule },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await onSaved?.();
    } catch (e) {
      console.error('Failed to update today’s calorie target', e);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box id="calorie-goal-panel" data-testid="day-target-editor">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <TextField
          label="Change today’s target"
          type="number"
          inputProps={{ inputMode: 'decimal' }}
          size="small"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          sx={{ flex: 1, minWidth: 0 }}
        />
        <Button variant="outlined" onClick={save} disabled={saving || !input} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}>
          Save
        </Button>
      </Box>
      {saved && <Alert severity="success" sx={{ mt: 3 }}>Today’s target saved</Alert>}
      {failed && <Alert severity="error" sx={{ mt: 3 }}>Couldn’t save that. Try again.</Alert>}
    </Box>
  );
}
