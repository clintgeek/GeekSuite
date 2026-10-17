import React, { useState, useEffect } from 'react';
import {
  Button,
  Box,
  Typography,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider
} from '@mui/material';
import {
  People as PeopleIcon,
  ContentCopy as CopyIcon,
  Restaurant as MealIcon
} from '@mui/icons-material';
import { fitnessGeekService } from '../../services/fitnessGeekService';
import { errorMessage } from '../../utils/errorMessage.js';
import PremiumDialog from '../primitives/PremiumDialog.jsx';
import { mealLabel, mealWord } from '../../utils/plainWords.js';
import { useToday } from '../../hooks/useToday.js';
import { dayName } from './dayWords.js';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * What someone in the household ate on the day on screen, with a plain
 * "Copy to your log" on each meal (UX review L7). A copy opens Copy a meal
 * already filled in, so it shows the sentence first and ends with the same
 * "Copied to …" toast and Undo as any other copy.
 */
const HouseholdLogView = ({ open, onClose, currentDate, onCopyMeal }) => {
  const today = useToday();
  const [loading, setLoading] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [error, setError] = useState('');

  const [householdMembers, setHouseholdMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');
  const [memberLogs, setMemberLogs] = useState([]);
  const [memberName, setMemberName] = useState('');
  const [householdName, setHouseholdName] = useState('');

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
      // The service resolves to the household itself (`apiService` unwraps
      // the single GraphQL root field) — reading `.data.members` off it was
      // always undefined, so this view said nobody was sharing, for everyone.
      // Same double-unwrap HouseholdSettings had until 2026-09-19.
      const household = await fitnessGeekService.getHouseholdMembers();
      const members = household?.members?.filter(m => m.shares_food_logs) || [];
      setHouseholdName(household?.name || '');
      setHouseholdMembers(members);

      if (!household?.household_id) {
        setError('You are not part of a household. Go to Settings to create or join one.');
      } else if (members.length === 0) {
        setError('No household members are sharing their food logs');
      } else if (members.length === 1) {
        // Auto-select if only one member
        setSelectedMember(members[0].user_id);
      }
    } catch (err) {
      setError(errorMessage(err, 'Failed to load household members'));
    } finally {
      setLoading(false);
    }
  };

  const loadMemberLogs = async () => {
    try {
      setLoadingLogs(true);
      setError('');
      // Resolves to the log array itself; the member's name comes from the
      // member list, which the logs query never carried.
      const logs = await fitnessGeekService.getHouseholdMemberLogs(selectedMember, currentDate);
      setMemberLogs(Array.isArray(logs) ? logs : []);
      setMemberName(
        householdMembers.find(m => m.user_id === selectedMember)?.display_name || 'Household Member'
      );
    } catch (err) {
      setError(errorMessage(err, 'Failed to load member logs'));
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
    onCopyMeal?.({
      fromDate: currentDate,
      fromMealType: mealType,
      fromUserId: selectedMember,
      memberName: memberName
    });
  };

  const handleCopyAll = () => {
    onCopyMeal?.({
      fromDate: currentDate,
      fromMealType: null,
      fromUserId: selectedMember,
      memberName: memberName
    });
  };

  const day = currentDate ? dayName(currentDate, today) : '';
  const onDay = day === 'today' || day === 'tomorrow' ? day : `on ${day}`;

  const calculateMealCalories = (logs) => {
    return logs.reduce((sum, log) => {
      const cals = log.nutrition?.calories_per_serving || log.food_item_id?.nutrition?.calories_per_serving || 0;
      return sum + (cals * (log.servings || 1));
    }, 0);
  };

  const groupedLogs = groupLogsByMealType();

  return (
    <PremiumDialog
      open={open}
      onClose={onClose}
      eyebrow="Household"
      title={householdName ? `${householdName} Food Logs` : 'Household Food Logs'}
      icon={PeopleIcon}
      maxWidth="md"
      secondaryAction={<Button onClick={onClose}>Close</Button>}
    >
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
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                      <Typography variant="subtitle1">
                        What {memberName} ate {onDay}
                      </Typography>
                      {memberLogs.length > 0 && (
                        <Button
                          variant="outlined"
                          startIcon={<CopyIcon />}
                          onClick={handleCopyAll}
                          aria-label={`Copy ${memberName}'s whole day to your log`}
                          sx={{ minHeight: 44 }}
                        >
                          Copy the whole day
                        </Button>
                      )}
                    </Box>

                    {loadingLogs ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress />
                      </Box>
                    ) : memberLogs.length === 0 ? (
                      <Alert severity="info">
                        {memberName} hasn't logged anything {onDay}.
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
                                    {mealLabel(mealType)}
                                  </Typography>
                                  <Chip
                                    label={`${Math.round(totalCals)} cal`}
                                    size="small"
                                    color="primary"
                                    variant="outlined"
                                  />
                                </Box>
                                <Button
                                  startIcon={<CopyIcon />}
                                  onClick={() => handleCopyMeal(mealType)}
                                  aria-label={`Copy ${memberName}'s ${mealWord(mealType)} to your log`}
                                  sx={{ minHeight: 44 }}
                                >
                                  Copy to your log
                                </Button>
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
    </PremiumDialog>
  );
};

export default HouseholdLogView;
