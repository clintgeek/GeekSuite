import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Chip,
  Divider
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  ArrowForward as ArrowIcon,
  People as PeopleIcon
} from '@mui/icons-material';
import { fitnessGeekService } from '../../services/fitnessGeekService';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

const CopyMealDialog = ({ open, onClose, currentDate, onCopyComplete, prefill = null }) => {
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [fromDate, setFromDate] = useState(currentDate);
  const [fromMealType, setFromMealType] = useState('');
  const [toDate, setToDate] = useState('');
  const [toMealType, setToMealType] = useState('');

  // Household state
  const [householdMembers, setHouseholdMembers] = useState([]);
  const [fromUserId, setFromUserId] = useState('');

  // Load household members when dialog opens
  useEffect(() => {
    if (open) {
      loadHouseholdMembers();
      // Set default dates
      setFromDate(currentDate);
      // Default to date is tomorrow
      const tomorrow = new Date(currentDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      setToDate(fitnessGeekService.formatDate(tomorrow));
      setFromMealType('');
      setToMealType('');
      setFromUserId('');
      setError('');
      setSuccess('');

      if (prefill) {
        setFromDate(prefill.fromDate || currentDate);
        setFromMealType(prefill.fromMealType || '');
        setToDate(prefill.targetDate || currentDate);
        setToMealType(prefill.toMealType ?? prefill.fromMealType ?? '');
        setFromUserId(prefill.fromUserId || '');
      }
    }
  }, [open, currentDate, prefill]);

  const loadHouseholdMembers = async () => {
    try {
      const response = await fitnessGeekService.getHouseholdMembers();
      if (response.data?.members) {
        setHouseholdMembers(response.data.members);
      }
    } catch (error) {
      // Silently fail - household is optional
      console.debug('No household configured', error);
    }
  };

  const handleCopy = async () => {
    if (!fromDate || !toDate) {
      setError('Please select both source and destination dates');
      return;
    }

    try {
      setCopying(true);
      setError('');
      setSuccess('');

      const response = await fitnessGeekService.copyMeal(
        fromDate,
        toDate,
        fromMealType || null,
        toMealType || null,
        fromUserId || null
      );

      setSuccess(response.message || 'Meal copied successfully!');

      // Notify parent to refresh
      if (onCopyComplete) {
        onCopyComplete(toDate);
      }

      // Close after short delay
      setTimeout(() => {
        onClose();
      }, 1500);

    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to copy meal');
    } finally {
      setCopying(false);
    }
  };

  const formatMealType = (type) => {
    return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'All Meals';
  };

  // Quick copy presets
  const handleQuickCopy = (preset) => {
    const tomorrow = new Date(currentDate);
    tomorrow.setDate(tomorrow.getDate() + 1);

    switch (preset) {
      case 'dinner-to-lunch':
        setFromDate(currentDate);
        setFromMealType('dinner');
        setToDate(fitnessGeekService.formatDate(tomorrow));
        setToMealType('lunch');
        break;
      case 'yesterday-dinner':
        {
          const yesterday = new Date(currentDate);
          yesterday.setDate(yesterday.getDate() - 1);
          setFromDate(fitnessGeekService.formatDate(yesterday));
          setFromMealType('dinner');
          setToDate(currentDate);
          setToMealType('lunch');
        }
        break;
      case 'all-to-tomorrow':
        setFromDate(currentDate);
        setFromMealType('');
        setToDate(fitnessGeekService.formatDate(tomorrow));
        setToMealType('');
        break;
      default:
        break;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CopyIcon color="primary" />
        Copy Meal
      </DialogTitle>

      <DialogContent>
        {/* Quick Presets */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Quick Copy
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label="Dinner → Tomorrow's Lunch"
              onClick={() => handleQuickCopy('dinner-to-lunch')}
              variant="outlined"
              color="primary"
              size="small"
            />
            <Chip
              label="Yesterday's Dinner → Today's Lunch"
              onClick={() => handleQuickCopy('yesterday-dinner')}
              variant="outlined"
              color="primary"
              size="small"
            />
            <Chip
              label="Copy Entire Day"
              onClick={() => handleQuickCopy('all-to-tomorrow')}
              variant="outlined"
              size="small"
            />
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Source Selection */}
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Copy From
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <TextField
            label="Date"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
          />
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Meal</InputLabel>
            <Select
              value={fromMealType}
              onChange={(e) => setFromMealType(e.target.value)}
              label="Meal"
            >
              <MenuItem value="">All Meals</MenuItem>
              {MEAL_TYPES.map(type => (
                <MenuItem key={type} value={type}>
                  {formatMealType(type)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Household member selector */}
          {householdMembers.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>From</InputLabel>
              <Select
                value={fromUserId}
                onChange={(e) => setFromUserId(e.target.value)}
                label="From"
                startAdornment={fromUserId ? <PeopleIcon sx={{ mr: 1, fontSize: 18 }} /> : null}
              >
                <MenuItem value="">My Log</MenuItem>
                {householdMembers.filter(m => m.shares_food_logs).map(member => (
                  <MenuItem key={member.user_id} value={member.user_id}>
                    {member.display_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>

        {/* Arrow */}
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 1 }}>
          <ArrowIcon color="action" sx={{ fontSize: 32 }} />
        </Box>

        {/* Destination Selection */}
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Copy To
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Date"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
          />
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Meal</InputLabel>
            <Select
              value={toMealType}
              onChange={(e) => setToMealType(e.target.value)}
              label="Meal"
            >
              <MenuItem value="">Same as Source</MenuItem>
              {MEAL_TYPES.map(type => (
                <MenuItem key={type} value={type}>
                  {formatMealType(type)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Summary */}
        <Box sx={{
          mt: 3,
          p: 2,
          bgcolor: 'grey.50',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'grey.200'
        }}>
          <Typography variant="body2" color="text.secondary">
            Will copy: <strong>{formatMealType(fromMealType)}</strong> from{' '}
            <strong>{fromDate}</strong>
            {fromUserId && householdMembers.find(m => m.user_id === fromUserId) && (
              <> ({householdMembers.find(m => m.user_id === fromUserId).display_name}'s log)</>
            )}
            <br />
            To: <strong>{toMealType ? formatMealType(toMealType) : formatMealType(fromMealType)}</strong> on{' '}
            <strong>{toDate}</strong>
          </Typography>
        </Box>

        {/* Messages */}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {success}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={copying}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleCopy}
          disabled={copying || !fromDate || !toDate}
          startIcon={copying ? <CircularProgress size={20} /> : <CopyIcon />}
        >
          {copying ? 'Copying...' : 'Copy Meal'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CopyMealDialog;
