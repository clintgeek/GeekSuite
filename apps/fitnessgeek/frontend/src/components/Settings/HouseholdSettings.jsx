import React, { useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Typography,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  IconButton,
} from '@mui/material';
import {
  PersonAdd as JoinIcon,
  GroupAdd as CreateIcon,
  ContentCopy as CopyIcon,
  ExitToApp as LeaveIcon,
  Check as CheckIcon,
  Restaurant as FoodIcon,
  MenuBook as MealsIcon
} from '@mui/icons-material';
import { GeekErrorState, useToast } from '@geeksuite/ui';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import { LabelPanel, Tag } from '../primitives';
import { settingsService } from '../../services/settingsService';
import { errorMessage } from '../../utils/errorMessage.js';
import { SWITCH_ROW } from './switchRow.js';
import SaveNote, { SavedWords, useSaveNote } from './SaveNote.jsx';

const HouseholdSettings = () => {
  const { notify } = useToast();
  const [loading, setLoading] = useState(true);
  // A failed read is its own state: drawn as "no household" it offered
  // Create and Join to a person who is already in one.
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  // Said inside the open dialog, where she is looking (the toast is behind it).
  const [dialogError, setDialogError] = useState(null);
  const [nameError, setNameError] = useState(false);
  // "Saved", or why not, beside the switch or box that was changed.
  const note = useSaveNote();

  // Household data
  const [householdData, setHouseholdData] = useState(null);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  // Form inputs
  const [displayName, setDisplayName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    loadHouseholdSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load; loadHouseholdSettings now closes over `notify` from useToast(), which the linter can't prove is stable.
  }, []);

  const loadHouseholdSettings = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      // `settingsService.getHouseholdSettings()` already returns the household
      // itself, not an envelope: `apiService.get` unwraps a single-key GraphQL
      // response (`{ fitnessHousehold: {...} }` -> `{...}`) and the service
      // returns that `.data`. Reaching for `.data` a second time here yielded
      // `undefined` on every load, so `isInHousehold` was permanently false and
      // EVERY user saw only Create/Join — including one actually in a household.
      //
      // Invisible until 2026-09-19 because no CI scene had ever rendered this
      // screen; the wire response was correct the whole time.
      const household = await settingsService.getHouseholdSettings();
      setHouseholdData(household);
      setDisplayName(household?.display_name || '');
      setHouseholdName(household?.name || '');
    } catch (err) {
      setLoadError(errorMessage(err, 'Couldn’t load your household. Try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateHousehold = async () => {
    if (!displayName.trim()) {
      notify('Add the name your family will see.', { tone: 'error' });
      return;
    }

    try {
      setSaving(true);
      setDialogError(null);
      // The service resolves to the bare `{ household_id }` — there is no
      // `.data.message`. Reading one threw AFTER the household was created,
      // so a success landed in the catch and said "Failed to create".
      await settingsService.createHousehold(displayName, householdName.trim() || undefined);
      notify('Household created', { tone: 'success' });
      setShowCreateDialog(false);
      await loadHouseholdSettings();
    } catch (err) {
      const message = errorMessage(err, 'Couldn’t create the household. Try again.');
      setDialogError(message);
      notify(message, { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleJoinHousehold = async () => {
    if (!joinCode.trim()) {
      notify('Enter the code from your family member’s phone.', { tone: 'error' });
      return;
    }
    if (!displayName.trim()) {
      notify('Add the name your family will see.', { tone: 'error' });
      return;
    }

    try {
      setSaving(true);
      setDialogError(null);
      await settingsService.joinHousehold(joinCode.trim(), displayName);
      notify('Joined the household', { tone: 'success' });
      setShowJoinDialog(false);
      await loadHouseholdSettings();
    } catch (err) {
      const message = errorMessage(err, 'Couldn’t join the household. Try again.');
      setDialogError(message);
      notify(message, { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleLeaveHousehold = async () => {
    try {
      setSaving(true);
      setDialogError(null);
      await settingsService.leaveHousehold();
      notify('You left the household', { tone: 'success' });
      setShowLeaveDialog(false);
      await loadHouseholdSettings();
    } catch (err) {
      const message = errorMessage(err, 'Couldn’t leave the household. Try again.');
      setDialogError(message);
      notify(message, { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSharing = async (field, value) => {
    try {
      setSaving(true);
      note.clear();
      await settingsService.updateHouseholdSettings({ [field]: value });
      // An emptied name is "no name"; a switch turned off is `false`, kept as
      // it is. (`value || null` turned an off switch into null, which the
      // switch reads as "on by default": it flicked back on after saving off.)
      setHouseholdData(prev => ({ ...prev, [field]: typeof value === 'boolean' ? value : (value || null) }));
      // Every setting on the page saves as it changes, and says so in place.
      note.saved(field);
    } catch (err) {
      const message = errorMessage(err, 'Couldn’t save that. Try again.');
      notify(message, { tone: 'error' });
      // The typed name stays in the box, with the failure said under it;
      // leaving the box again retries (it used to snap back to the old name).
      if (field === 'name') setNameError(true);
      // A switch stays where it was, and the line under it says why.
      else note.failed(field, message);
    } finally {
      setSaving(false);
    }
  };

  // The clipboard is missing outside a secure context and can refuse: the
  // tick only shows for a copy that happened.
  const handleCopyCode = async () => {
    if (!householdData?.household_id) return;
    try {
      await navigator.clipboard.writeText(householdData.household_id);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      notify('Couldn’t copy the code. Press and hold it to copy.', { tone: 'error' });
    }
  };

  const openDialog = (show) => {
    setDialogError(null);
    show(true);
  };

  if (loading) {
    return (
      <LabelPanel title="Household sharing" titleComponent="h2">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress aria-label="Loading your household" />
        </Box>
      </LabelPanel>
    );
  }

  if (loadError) {
    return (
      <LabelPanel title="Household sharing" titleComponent="h2">
        <GeekErrorState title="Couldn’t load your household" description={loadError} onRetry={loadHouseholdSettings} />
      </LabelPanel>
    );
  }

  const isInHousehold = !!householdData?.household_id;

  return (
    <LabelPanel title="Household sharing" titleComponent="h2">
      <Box>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          Share food logs and meals with your family. See what they ate, and copy a meal in a tap.
        </Typography>

        {!isInHousehold ? (
          // Not in a household - show create/join options
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<CreateIcon />}
              onClick={() => openDialog(setShowCreateDialog)}
              sx={{ minHeight: 44 }}
            >
              Create a household
            </Button>
            <Button
              variant="tonal"
              startIcon={<JoinIcon />}
              onClick={() => openDialog(setShowJoinDialog)}
              sx={{ minHeight: 44 }}
            >
              Join a household
            </Button>
          </Box>
        ) : (
          // In a household - show settings and members
          <>
            {/* Household name — the household's, so a rename shows for everyone */}
            {/* Saved when she leaves the box (or presses Enter), like every
                other setting on the page — no Save button of its own. */}
            <Box sx={{ mb: 4 }}>
              <TextField
                fullWidth
                label="Household name"
                value={householdName}
                onChange={(e) => { setHouseholdName(e.target.value); setNameError(false); }}
                onBlur={() => {
                  const next = householdName.trim();
                  if (next !== (householdData.name || '')) { setNameError(false); handleUpdateSharing('name', next); }
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                placeholder="Like Crocker"
                inputProps={{ maxLength: 40 }}
                error={nameError}
                helperText={nameError ? 'Couldn’t save that. Try again.' : note.isSaved('name') ? <SavedWords /> : 'Everyone in the household sees this name.'}
              />
            </Box>

            {/* Household Code */}
            {/* A rule and a row, not a box inside the panel. */}
            <Box sx={{ py: 3, borderTop: (t) => `1px solid ${t.palette.divider}` }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Household code
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>
                  {householdData.household_id}
                </Typography>
                {/*
                  * Icon-only, so the label IS the button's name — there is no
                  * inner text for a screen reader to fall back to. It tracks
                  * `codeCopied` so the confirmation is announced and not just
                  * drawn: a tick that only changes colour says nothing to
                  * anyone not looking at it.
                  *
                  * axe never flagged this before 2026-09-19 because the branch
                  * it lives in was unreachable — `householdData` was always
                  * undefined (see loadHouseholdSettings), so every run audited
                  * the Create/Join half and the gate passed on UI no user in a
                  * household could actually get to.
                  */}
                <IconButton
                  onClick={handleCopyCode}
                  sx={{ width: 44, height: 44 }}
                  aria-label={codeCopied ? 'Household code copied' : 'Copy household code'}
                >
                  {codeCopied ? <CheckIcon color="success" /> : <CopyIcon />}
                </IconButton>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Share this code with your family so they can join.
              </Typography>
            </Box>

            <Divider sx={{ mb: 3 }} />

            {/* Your Sharing Settings */}
            <Typography sx={{ fontWeight: 600, mb: 1 }}>
              What you share
            </Typography>
            <Box sx={{ mb: 3 }}>
              <FormControlLabel
                labelPlacement="start"
                sx={SWITCH_ROW}
                control={
                  <Switch
                    checked={householdData.share_food_logs ?? true}
                    onChange={(e) => handleUpdateSharing('share_food_logs', e.target.checked)}
                    disabled={saving}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FoodIcon fontSize="small" />
                    Share my food logs
                  </Box>
                }
              />
              <SaveNote note={note} for="share_food_logs" sx={{ mt: 0, mb: 1 }} />
              <FormControlLabel
                labelPlacement="start"
                sx={SWITCH_ROW}
                control={
                  <Switch
                    checked={householdData.share_meals ?? true}
                    onChange={(e) => handleUpdateSharing('share_meals', e.target.checked)}
                    disabled={saving}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <MealsIcon fontSize="small" />
                    Share my saved meals
                  </Box>
                }
              />
              <SaveNote note={note} for="share_meals" sx={{ mt: 0 }} />
            </Box>

            <Divider sx={{ mb: 3 }} />

            {/* Household Members */}
            <Typography sx={{ fontWeight: 600, mb: 1 }}>
              Who’s in it
            </Typography>
            {householdData.members?.length > 0 ? (
              <List dense disablePadding>
                {householdData.members.filter(Boolean).map((member, i) => (
                  <ListItem key={member.user_id || i} disableGutters>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: 'primary.main' }}>
                        {member.display_name?.charAt(0)?.toUpperCase() || '?'}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={member.display_name}
                      secondary={
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                          {member.shares_food_logs && (
                            <Tag>Food logs</Tag>
                          )}
                          {member.shares_meals && (
                            <Tag>Meals</Tag>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No one else yet. Share the code above to invite your family.
              </Typography>
            )}

            <Divider sx={{ mt: 3, mb: 2 }} />

            {/* Leave Household */}
            <Button
              color="error"
              startIcon={<LeaveIcon />}
              onClick={() => openDialog(setShowLeaveDialog)}
              sx={{ minHeight: 44 }}
            >
              Leave household
            </Button>
          </>
        )}
      </Box>

      {/* Create Household Dialog */}
      <PremiumDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        title="Create a household"
        icon={CreateIcon}
        maxWidth="xs"
        primaryAction={
          <Button
            variant="contained"
            onClick={handleCreateHousehold}
            disabled={saving || !displayName.trim()}
          >
            {saving ? <CircularProgress size={20} /> : 'Create'}
          </Button>
        }
        secondaryAction={<Button onClick={() => setShowCreateDialog(false)}>Cancel</Button>}
      >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Create a household to share food logs and meals with your family.
          </Typography>
          <TextField
            fullWidth
            label="Household name"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            placeholder="Like Crocker"
            inputProps={{ maxLength: 40 }}
            sx={{ mb: 4 }}
          />
          <TextField
            fullWidth
            label="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Like Clint"
            helperText="The name your family sees."
          />
          {dialogError && <Alert severity="error" sx={{ mt: 4 }}>{dialogError}</Alert>}
      </PremiumDialog>

      {/* Join Household Dialog */}
      <PremiumDialog
        open={showJoinDialog}
        onClose={() => setShowJoinDialog(false)}
        title="Join a household"
        icon={JoinIcon}
        maxWidth="xs"
        primaryAction={
          <Button
            variant="contained"
            onClick={handleJoinHousehold}
            disabled={saving || !joinCode.trim() || !displayName.trim()}
          >
            {saving ? <CircularProgress size={20} /> : 'Join'}
          </Button>
        }
        secondaryAction={<Button onClick={() => setShowJoinDialog(false)}>Cancel</Button>}
      >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Enter the code from your family member’s phone. It’s in their Settings, under Household sharing.
          </Typography>
          <TextField
            fullWidth
            label="Household code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Like 7D9169DE1A8F"
            sx={{ mb: 4 }}
            inputProps={{ style: { fontWeight: 700, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' } }}
          />
          <TextField
            fullWidth
            label="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Like Sarah"
            helperText="The name your family sees."
          />
          {dialogError && <Alert severity="error" sx={{ mt: 4 }}>{dialogError}</Alert>}
      </PremiumDialog>

      {/* Leave Household Dialog */}
      <PremiumDialog
        open={showLeaveDialog}
        onClose={() => setShowLeaveDialog(false)}
        title="Leave the household?"
        maxWidth="xs"
        primaryAction={
          <Button
            color="error"
            variant="contained"
            onClick={handleLeaveHousehold}
            disabled={saving}
          >
            {saving ? <CircularProgress size={20} /> : 'Leave'}
          </Button>
        }
        secondaryAction={<Button onClick={() => setShowLeaveDialog(false)}>Cancel</Button>}
      >
        <Typography>
          You won’t see your family’s food logs or meals any more. You can join again with the code.
        </Typography>
        {dialogError && <Alert severity="error" sx={{ mt: 4 }}>{dialogError}</Alert>}
      </PremiumDialog>
    </LabelPanel>
  );
};

export default HouseholdSettings;
