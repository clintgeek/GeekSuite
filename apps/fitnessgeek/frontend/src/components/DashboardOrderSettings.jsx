import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Switch,
  FormControlLabel,
  Paper,
  IconButton,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Restaurant as FoodIcon,
  MonitorWeight as WeightIcon,
  MonitorHeart as BPIcon,
  TrendingUp as TrendingIcon,
  TrendingDown as TrendingDownIcon,
  LocalFireDepartment as StreakIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Restaurant as NutritionIcon,
  FlashOn as QuickActionsIcon,
  DragIndicator as DragIndicatorIcon,
  Restaurant as ForkKnifeIcon
} from '@mui/icons-material';
import logger from '../utils/logger.js';

// Sortable item component
const SortableItem = ({ cardKey, cardConfig, settings, onToggleCard }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cardKey });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      elevation={isDragging ? 8 : 2}
      sx={{
        mb: 1,
        p: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: isDragging ? '#f5f5f5' : 'white',
        border: isDragging ? '2px dashed' : '1px solid #e0e0e0',
        borderColor: isDragging ? 'primary.main' : '#e0e0e0',
        borderRadius: 1,
        transition: 'all 0.2s ease-in-out',
      }}
    >
      {/* Drag area - only this part is draggable */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          cursor: 'grab',
          '&:active': {
            cursor: 'grabbing',
          },
        }}
        {...attributes}
        {...listeners}
      >
        <IconButton
          size="small"
          sx={{ mr: 1, color: '#666' }}
        >
          <DragIndicatorIcon />
        </IconButton>

        <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
          <Box sx={{ mr: 1, color: 'primary.main' }}>
            {cardConfig[cardKey].icon}
          </Box>
          <Box>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              {cardConfig[cardKey].label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {cardConfig[cardKey].description}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Toggle area - separate from drag area */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          // Prevent drag events from bubbling up
          '& *': {
            pointerEvents: 'auto'
          }
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <FormControlLabel
          control={
            <Switch
              checked={settings[`show_${cardKey}`]}
              onChange={(e) => onToggleCard(cardKey, e.target.checked)}
              size="small"
            />
          }
          label=""
        />
      </Box>
    </Paper>
  );
};

const DashboardOrderSettings = ({ settings, onSettingsChange, onOrderChange }) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // If settings is null, show loading
  if (!settings) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Card configurations
  const cardConfigs = {
    calories_today: {
      icon: <ForkKnifeIcon />,
      label: 'Calories Today',
      description: 'Show today\'s calorie intake'
    },
    current_weight: {
      icon: <WeightIcon />,
      label: 'Weight Progress',
      description: 'Show weekly weight change'
    },
    blood_pressure: {
      icon: <BPIcon />,
      label: 'Blood Pressure',
      description: 'Show latest BP reading'
    },
    login_streak: {
      icon: <StreakIcon />,
      label: 'Login Streak',
      description: 'Show current login streak'
    },
    nutrition_today: {
      icon: <FoodIcon />,
      label: 'Nutrition Summary',
      description: 'Show today\'s nutrition breakdown'
    },
    garmin_summary: {
      icon: <BPIcon />,
      label: 'Garmin Summary',
      description: 'Show resting HR, steps, active kcal, and sleep'
    }
  };

  // Normalize order to include new cards and default visible=true for new toggles
  const defaultOrder = [
    'calories_today',
    'current_weight',
    'blood_pressure',
    'login_streak',
    'nutrition_today',
    'garmin_summary'
  ];
  const normalizedOrder = (settings?.card_order && settings.card_order.length)
    ? [...settings.card_order, ...Object.keys(cardConfigs).filter(k => !settings.card_order.includes(k))]
    : defaultOrder;

  const getVisibleCards = () => {
    return normalizedOrder.filter(cardKey => {
      const settingKey = `show_${cardKey}`;
      const isVisible = settings?.[settingKey];
      return (isVisible === undefined ? true : isVisible) && !!cardConfigs[cardKey];
    });
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const visibleCards = getVisibleCards();
      const oldIndex = visibleCards.indexOf(active.id);
      const newIndex = visibleCards.indexOf(over.id);

      const reorderedCards = arrayMove(visibleCards, oldIndex, newIndex);

      // Update the full card order while preserving hidden cards
      const cardOrder = normalizedOrder;

      const hiddenCards = cardOrder.filter(cardKey => {
        const settingKey = `show_${cardKey}`;
        return !settings?.[settingKey];
      });

      // Rebuild the order with visible cards in new order + hidden cards at the end
      const finalOrder = [...reorderedCards, ...hiddenCards];

      onOrderChange(finalOrder);
    }
  };

  const handleToggleCard = (cardKey, checked) => {
    const settingKey = `show_${cardKey}`;
    onSettingsChange(settingKey, checked);
  };

    const visibleCards = getVisibleCards();

  // Debug logging (dev only)
  logger.debug('DashboardOrderSettings render');

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Dashboard Card Order
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Drag and drop cards to reorder them on your dashboard. Toggle switches to show/hide cards.
      </Typography>

      {!settings?.card_order && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No card order found. Using default order.
        </Alert>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visibleCards}
          strategy={verticalListSortingStrategy}
        >
          <Box sx={{ mb: 3 }}>
            {visibleCards.map((cardKey) => (
              <SortableItem
                key={cardKey}
                cardKey={cardKey}
                cardConfig={cardConfigs}
                settings={settings}
                onToggleCard={handleToggleCard}
              />
            ))}
          </Box>
        </SortableContext>
      </DndContext>

      {/* Hidden Cards Section */}
      {normalizedOrder.some(cardKey => {
        const settingKey = `show_${cardKey}`;
        const isVisible = settings?.[settingKey];
        return !(isVisible === undefined ? true : isVisible);
      }) && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 2, color: 'text.secondary' }}>
            Hidden Cards
          </Typography>
          {normalizedOrder
            .filter(cardKey => {
              const settingKey = `show_${cardKey}`;
              const isVisible = settings?.[settingKey];
              return !(isVisible === undefined ? true : isVisible) && cardConfigs[cardKey];
            })
            .map((cardKey) => (
              <Paper
                key={cardKey}
                elevation={1}
                sx={{
                  mb: 1,
                  p: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#fafafa',
                  border: '1px solid #e0e0e0',
                  borderRadius: 1,
                  opacity: 0.7
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box sx={{ mr: 1, color: '#999' }}>
                    {cardConfigs[cardKey]?.icon}
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                      {cardConfigs[cardKey]?.label || cardKey}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {cardConfigs[cardKey]?.description || 'Card description not available'}
                    </Typography>
                  </Box>
                </Box>

                <FormControlLabel
                  control={
                    <Switch
                      checked={settings?.[`show_${cardKey}`] || false}
                      onChange={(e) => handleToggleCard(cardKey, e.target.checked)}
                      size="small"
                    />
                  }
                  label=""
                />
              </Paper>
            ))}
        </Box>
      )}
    </Box>
  );
};

export default DashboardOrderSettings;