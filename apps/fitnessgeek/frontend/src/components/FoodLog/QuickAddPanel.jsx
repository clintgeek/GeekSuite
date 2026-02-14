import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  IconButton,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Alert,
  Collapse,
  Button
} from '@mui/material';
import {
  Star as StarIcon,
  History as HistoryIcon,
  Add as AddIcon,
  Restaurant as FoodIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { foodService } from '../../services/foodService.js';

const QuickAddPanel = ({
  onAddFood,
  selectedMealType = 'snack',
  onMealTypeChange
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [favorites, setFavorites] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (expanded) {
      loadData();
    }
  }, [expanded, activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 0) {
        const data = await foodService.getFavorites();
        setFavorites(data || []);
      } else {
        const data = await foodService.getRecent(20);
        setRecent(data || []);
      }
    } catch (err) {
      console.error('Failed to load quick add data:', err);
      setError('Failed to load foods');
    } finally {
      setLoading(false);
    }
  };

  const handleAddFood = (food) => {
    // Create a food log structure for the add dialog
    onAddFood({
      food_item: food,
      servings: 1,
      meal_type: selectedMealType
    });
  };

  const foods = activeTab === 0 ? favorites : recent;
  const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];

  return (
    <Box sx={{ mb: 2 }}>
      {/* Collapse Header */}
      <Button
        fullWidth
        onClick={() => setExpanded(!expanded)}
        sx={{
          justifyContent: 'space-between',
          py: 1.5,
          px: 2,
          backgroundColor: theme.palette.background.paper,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
          textTransform: 'none',
          '&:hover': {
            backgroundColor: 'action.hover'
          }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <StarIcon sx={{ color: '#f59e0b', fontSize: 20 }} />
          <Typography variant="body1" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
            Quick Add
          </Typography>
          <Chip
            label="Favorites & Recent"
            size="small"
            sx={{
              height: 20,
              fontSize: '0.7rem',
              backgroundColor: 'rgba(13, 148, 136, 0.1)',
              color: 'primary.main'
            }}
          />
          <ToggleButtonGroup
            size="small"
            value={selectedMealType}
            exclusive
            onChange={(_, next) => next && onMealTypeChange?.(next)}
            sx={{
              ml: { xs: 0, sm: 1 },
              '& .MuiToggleButton-root': {
                textTransform: 'capitalize',
                fontSize: '0.7rem',
                px: 1,
                py: 0.2
              }
            }}
          >
            {mealTypes.map((meal) => (
              <ToggleButton key={meal} value={meal}>
                {meal}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        {expanded ? <CollapseIcon /> : <ExpandIcon />}
      </Button>

      {/* Expanded Content */}
      <Collapse in={expanded}>
        <Box
          sx={{
            mt: 1,
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 2,
            overflow: 'hidden'
          }}
        >
          {/* Tabs */}
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant="fullWidth"
            sx={{
              borderBottom: `1px solid ${theme.palette.divider}`,
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                minHeight: 48
              }
            }}
          >
            <Tab
              icon={<StarIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              label="Favorites"
            />
            <Tab
              icon={<HistoryIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              label="Recent"
            />
          </Tabs>

          {/* Content */}
          <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : error ? (
              <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>
            ) : foods.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4, color: theme.palette.text.secondary }}>
                <Typography variant="body2">
                  {activeTab === 0
                    ? 'No favorites yet. Star foods to add them here!'
                    : 'No recent foods. Start logging to see them here!'}
                </Typography>
              </Box>
            ) : (
              <List dense sx={{ py: 0 }}>
                {foods.map((food) => (
                  <ListItem
                    key={food.id}
                    sx={{
                      borderBottom: `1px solid ${theme.palette.divider}`,
                      '&:last-child': { borderBottom: 'none' },
                      '&:hover': {
                        backgroundColor: theme.palette.mode === 'dark'
                          ? 'rgba(255,255,255,0.03)'
                          : 'rgba(0,0,0,0.02)'
                      }
                    }}
                  >
                    <ListItemAvatar>
                      <Avatar
                        sx={{
                          width: 36,
                          height: 36,
                          backgroundColor: 'primary.main'
                        }}
                      >
                        <FoodIcon sx={{ fontSize: 18 }} />
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {food.name}
                        </Typography>
                      }
                      secondaryTypographyProps={{ component: 'div' }}
                      secondary={
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                          <Chip
                            label={`${food.nutrition?.calories_per_serving || 0} cal`}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.65rem',
                              backgroundColor: 'rgba(13, 148, 136, 0.1)',
                              color: 'primary.main'
                            }}
                          />
                          {food.brand && (
                            <Typography variant="caption" color="text.secondary">
                              {food.brand}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() => handleAddFood(food)}
                        sx={{
                          color: '#10b981',
                          backgroundColor: 'rgba(16, 185, 129, 0.1)',
                          '&:hover': {
                            backgroundColor: 'rgba(16, 185, 129, 0.2)'
                          }
                        }}
                      >
                        <AddIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
};

export default QuickAddPanel;
