import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Tooltip
} from '@mui/material';
import {
  People as PeopleIcon,
  ContentCopy as CopyIcon,
  Add as AddIcon,
  Restaurant as MealIcon
} from '@mui/icons-material';
import { fitnessGeekService } from '../../services/fitnessGeekService';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

const HouseholdLogView = ({ open, onClose, currentDate, onCopyMeal }) => {
  const [loading, setLoading] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [householdMembers, setHouseholdMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');
  const [memberLogs, setMemberLogs] = useState([]);
  const [memberName, setMemberName] = useState('');

  useEffect(() => {
    if (open) {
      loadHouseholdMembers();
    }
  }, [open]);

  useEffect(() => {
    if (selectedMember && currentDate) {
      loadMemberLogs();
    }
  }, [selectedMember, currentDate]);

  const loadHouseholdMembers = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fitnessGeekService.getHouseholdMembers();
      const members = response.data?.members?.filter(m => m.shares_food_logs) || [];
      setHouseholdMembers(members);

      if (members.length === 0) {
        setError('No household members are sharing their food logs');
      } else if (members.length === 1) {
        // Auto-select if only one member
        setSelectedMember(members[0].user_id);
      }
    } catch (err) {
      if (err.response?.status === 403 || err.response?.data?.error?.code === 'NOT_IN_HOUSEHOLD') {
        setError('You are not part of a household. Go to Settings to create or join one.');
      } else {
        setError('Failed to load household members');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMemberLogs = async () => {
    try {
      setLoadingLogs(true);
      setError('');
      const response = await fitnessGeekService.getHouseholdMemberLogs(selectedMember, currentDate);
      setMemberLogs(response.data?.logs || []);
      setMemberName(response.data?.member_name || 'Household Member');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load member logs');
      setMemberLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const groupLogsByMealType = () => {
    const grouped = {};
    MEAL_TYPES.forEach(type => {
      grouped[type] = memberLogs.filter(log => log.meal_type === type);
    });
    return grouped;
  };

  const handleCopyMeal = (mealType) => {
    if (onCopyMeal) {
      onCopyMeal({
        fromDate: currentDate,
        fromMealType: mealType,
        fromUserId: selectedMember,
        memberName: memberName
      });
    }
    setSuccess(`Ready to copy ${memberName}'s ${mealType}`);
    setTimeout(() => setSuccess(''), 2000);
  };

  const handleCopyAll = () => {
    if (onCopyMeal) {
      onCopyMeal({
        fromDate: currentDate,
        fromMealType: null,
        fromUserId: selectedMember,
        memberName: memberName
      });
    }
    setSuccess(`Ready to copy all of ${memberName}'s meals`);
    setTimeout(() => setSuccess(''), 2000);
  };

  const formatMealType = (type) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const calculateMealCalories = (logs) => {
    return logs.reduce((sum, log) => {
      const cals = log.nutrition?.calories_per_serving || log.food_item_id?.nutrition?.calories_per_serving || 0;
      return sum + (cals * (log.servings || 1));
    }, 0);
  };

  const groupedLogs = groupLogsByMealType();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PeopleIcon color="primary" />
        Household Food Logs
      </DialogTitle>

      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {success && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {success}
              </Alert>
            )}

            {householdMembers.length > 0 && (
              <>
                {/* Member Selector */}
                <Box sx={{ mb: 3 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Select Household Member</InputLabel>
                    <Select
                      value={selectedMember}
                      onChange={(e) => setSelectedMember(e.target.value)}
                      label="Select Household Member"
                    >
                      {householdMembers.map(member => (
                        <MenuItem key={member.user_id} value={member.user_id}>
                          {member.display_name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>

                {selectedMember && (
                  <>
                    {/* Date Info */}
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="subtitle1">
                        {memberName}'s meals on <strong>{currentDate}</strong>
                      </Typography>
                      {memberLogs.length > 0 && (
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<CopyIcon />}
                          onClick={handleCopyAll}
                        >
                          Copy All Meals
                        </Button>
                      )}
                    </Box>

                    {loadingLogs ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress />
                      </Box>
                    ) : memberLogs.length === 0 ? (
                      <Alert severity="info">
                        {memberName} hasn't logged any food for this date
                      </Alert>
                    ) : (
                      // Meal Sections
                      MEAL_TYPES.map(mealType => {
                        const logs = groupedLogs[mealType];
                        if (logs.length === 0) return null;

                        const totalCals = calculateMealCalories(logs);

                        return (
                          <Card key={mealType} sx={{ mb: 2 }}>
                            <CardContent sx={{ pb: '8px !important' }}>
                              <Box sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                mb: 1
                              }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <MealIcon color="primary" fontSize="small" />
                                  <Typography variant="subtitle1" fontWeight={600}>
                                    {formatMealType(mealType)}
                                  </Typography>
                                  <Chip
                                    label={`${Math.round(totalCals)} cal`}
                                    size="small"
                                    color="primary"
                                    variant="outlined"
                                  />
                                </Box>
                                <Tooltip title={`Copy ${mealType} to your log`}>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleCopyMeal(mealType)}
                                    color="primary"
                                  >
                                    <CopyIcon />
                                  </IconButton>
                                </Tooltip>
                              </Box>

                              <List dense sx={{ py: 0 }}>
                                {logs.map((log, idx) => {
                                  const food = log.food_item_id || {};
                                  const cals = (log.nutrition?.calories_per_serving || food.nutrition?.calories_per_serving || 0) * (log.servings || 1);

                                  return (
                                    <ListItem key={log._id || idx} sx={{ px: 0 }}>
                                      <ListItemText
                                        primary={food.name || 'Unknown Food'}
                                        secondary={
                                          <Box component="span" sx={{ display: 'flex', gap: 1 }}>
                                            <span>{log.servings} serving{log.servings !== 1 ? 's' : ''}</span>
                                            <span>•</span>
                                            <span>{Math.round(cals)} cal</span>
                                          </Box>
                                        }
                                      />
                                    </ListItem>
                                  );
                                })}
                              </List>
                            </CardContent>
                          </Card>
                        );
                      })
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default HouseholdLogView;
