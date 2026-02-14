import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Slider,
  IconButton,
  Chip,
  TextField,
  InputAdornment,
  useTheme
} from '@mui/material';
import {
  Close as CloseIcon,
  Add as AddIcon,
  Remove as RemoveIcon
} from '@mui/icons-material';

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { value: 'lunch', label: 'Lunch', emoji: '☀️' },
  { value: 'dinner', label: 'Dinner', emoji: '🌙' },
  { value: 'snack', label: 'Snack', emoji: '🍎' }
];

const AddFoodModal = ({
  open,
  onClose,
  food,
  onAdd,
  defaultMealType = 'snack',
  defaultServings = 1
}) => {
  const theme = useTheme();
  const [servings, setServings] = useState(defaultServings);
  const [mealType, setMealType] = useState(defaultMealType);
  const [notes, setNotes] = useState('');

  // Reset state when food changes
  useEffect(() => {
    if (food) {
      setServings(defaultServings);
      setMealType(defaultMealType);
      setNotes('');
    }
  }, [food, defaultServings, defaultMealType]);

  if (!food) return null;

  const nutrition = food.nutrition || {};
  const calories = Math.round((nutrition.calories_per_serving || 0) * servings);
  const protein = Math.round((nutrition.protein_grams || 0) * servings * 10) / 10;
  const carbs = Math.round((nutrition.carbs_grams || 0) * servings * 10) / 10;
  const fat = Math.round((nutrition.fat_grams || 0) * servings * 10) / 10;

  const handleAdd = () => {
    onAdd({
      ...food,
      servings,
      mealType,
      notes: notes.trim()
    });
  };

  const handleClose = () => {
    setServings(defaultServings);
    setMealType(defaultMealType);
    setNotes('');
    onClose();
  };

  const incrementServings = () => {
    setServings(prev => Math.min(prev + 0.25, 10));
  };

  const decrementServings = () => {
    setServings(prev => Math.max(prev - 0.25, 0.25));
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx:{
          borderRadius: '12px',
          maxWidth: 480
        }
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 2,
          pt: 3,
          px: 3,
          fontWeight: 700,
          color: theme.palette.text.primary
        }}
      >
        Add to Log
        <IconButton
          onClick={handleClose}
          size="small"
          sx={{
            color: theme.palette.text.secondary,
            '&:hover': {
              backgroundColor: theme.palette.action.hover,
              color: theme.palette.text.primary
            }
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, pb: 2 }}>
        {/* Food Info Card */}
        <Box
          sx={{
            p: 2.5,
            mb: 3,
            borderRadius: '16px',
            background: `linear-gradient(135deg, ${theme.palette.primary.main}0d 0%, ${theme.palette.primary.dark}0d 100%)`,
            border: `1px solid ${theme.palette.primary.main}33`
          }}
        >
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              mb: 0.5,
              color: theme.palette.text.primary,
              fontSize: '1.125rem'
            }}
          >
            {food.name}
          </Typography>
          {food.brand && (
            <Typography
              variant="body2"
              sx={{
                color: theme.palette.text.secondary,
                mb: 2,
                fontSize: '0.875rem'
              }}
            >
              {food.brand}
            </Typography>
          )}

          {/* Nutrition Display */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label={`${calories} cal`}
              sx={{
                borderRadius: '999px',
                backgroundColor: theme.palette.primary.main,
                color: theme.palette.primary.contrastText,
                fontWeight: 700,
                fontSize: '0.875rem',
                height: 28
              }}
            />
            <Chip
              label={`P: ${protein}g`}
              sx={{
                borderRadius: '999px',
                backgroundColor: theme.palette.background.paper,
                color: theme.palette.primary.main,
                fontWeight: 600,
                fontSize: '0.875rem',
                height: 28,
                border: `1.5px solid ${theme.palette.primary.main}4d`
              }}
            />
            <Chip
              label={`C: ${carbs}g`}
              sx={{
                borderRadius: '999px',
                backgroundColor: theme.palette.background.paper,
                color: theme.palette.primary.main,
                fontWeight: 600,
                fontSize: '0.875rem',
                height: 28,
                border: `1.5px solid ${theme.palette.primary.main}4d`
              }}
            />
            <Chip
              label={`F: ${fat}g`}
              sx={{
                borderRadius: '999px',
                backgroundColor: theme.palette.background.paper,
                color: theme.palette.primary.main,
                fontWeight: 600,
                fontSize: '0.875rem',
                height: 28,
                border: `1.5px solid ${theme.palette.primary.main}4d`
              }}
            />
          </Box>
        </Box>

        {/* Servings Control */}
        <Box sx={{ mb: 3 }}>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 600,
              mb: 2,
              color: theme.palette.text.primary,
              fontSize: '0.9375rem'
            }}
          >
            Servings
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <IconButton
              onClick={decrementServings}
              disabled={servings <= 0.25}
              sx={{
                width: 40,
                height: 40,
                border: `2px solid ${theme.palette.divider}`,
                color: theme.palette.primary.main,
                '&:hover': {
                  borderColor: theme.palette.primary.main,
                  backgroundColor: `${theme.palette.primary.main}1a`
                },
                '&.Mui-disabled': {
                  borderColor: theme.palette.divider,
                  color: theme.palette.action.disabled
                }
              }}
            >
              <RemoveIcon />
            </IconButton>

            <TextField
              value={servings}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val >= 0.25 && val <= 10) {
                  setServings(val);
                }
              }}
              type="number"
              inputProps={{
                min: 0.25,
                max: 10,
                step: 0.25,
                style: { textAlign: 'center' }
              }}
              sx={{
                width: 100,
                '& .MuiOutlinedInput-root': {
                  borderRadius: '12px',
                  fontWeight: 700,
                  fontSize: '1.25rem',
                  color: theme.palette.primary.main,
                  '& fieldset': {
                    borderColor: theme.palette.divider,
                    borderWidth: '2px'
                  },
                  '&:hover fieldset': {
                    borderColor: theme.palette.primary.main
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: theme.palette.primary.main,
                    borderWidth: '2px'
                  }
                }
              }}
            />

            <IconButton
              onClick={incrementServings}
              disabled={servings >= 10}
              sx={{
                width: 40,
                height: 40,
                border: `2px solid ${theme.palette.divider}`,
                color: theme.palette.primary.main,
                '&:hover': {
                  borderColor: theme.palette.primary.main,
                  backgroundColor: `${theme.palette.primary.main}1a`
                },
                '&.Mui-disabled': {
                  borderColor: theme.palette.divider,
                  color: theme.palette.action.disabled
                }
              }}
            >
              <AddIcon />
            </IconButton>
          </Box>

          <Slider
            value={servings}
            onChange={(e, newValue) => setServings(newValue)}
            min={0.25}
            max={10}
            step={0.25}
            marks={[
              { value: 0.25, label: '0.25' },
              { value: 1, label: '1' },
              { value: 2.5, label: '2.5' },
              { value: 5, label: '5' },
              { value: 10, label: '10' }
            ]}
            sx={{
              color: theme.palette.primary.main,
              '& .MuiSlider-thumb': {
                width: 20,
                height: 20,
                backgroundColor: theme.palette.background.paper,
                border: `3px solid ${theme.palette.primary.main}`,
                '&:hover, &.Mui-focusVisible': {
                  boxShadow: `0 0 0 8px ${theme.palette.primary.main}29`
                }
              },
              '& .MuiSlider-track': {
                height: 6,
                backgroundColor: theme.palette.primary.main
              },
              '& .MuiSlider-rail': {
                height: 6,
                backgroundColor: theme.palette.divider
              },
              '& .MuiSlider-mark': {
                backgroundColor: theme.palette.divider,
                height: 8,
                width: 2
              },
              '& .MuiSlider-markLabel': {
                fontSize: '0.75rem',
                color: theme.palette.text.secondary
              }
            }}
          />
        </Box>

        {/* Meal Type Selection */}
        <Box sx={{ mb: 3 }}>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 600,
              mb: 1.5,
              color: theme.palette.text.primary,
              fontSize: '0.9375rem'
            }}
          >
            Meal Type
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {MEAL_TYPES.map((type) => (
              <Chip
                key={type.value}
                label={`${type.emoji} ${type.label}`}
                onClick={() => setMealType(type.value)}
                sx={{
                  borderRadius: '999px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  height: 36,
                  px: 1,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  ...(mealType === type.value
                    ? {
                        backgroundColor: theme.palette.primary.main,
                        color: theme.palette.primary.contrastText,
                        '&:hover': {
                          backgroundColor: theme.palette.primary.dark,
                        }
                      }
                    : {
                        backgroundColor: theme.palette.background.default,
                        color: theme.palette.text.secondary,
                        border: `1.5px solid ${theme.palette.divider}`,
                        '&:hover': {
                          backgroundColor: `${theme.palette.primary.main}1a`,
                          borderColor: theme.palette.primary.main,
                          color: theme.palette.primary.main
                        }
                      })
                }}
              />
            ))}
          </Box>
        </Box>

        {/* Notes (Optional) */}
        <Box>
          <Typography
            variant="body1"
            sx={{
              fontWeight: 600,
              mb: 1.5,
              color: theme.palette.text.primary,
              fontSize: '0.9375rem'
            }}
          >
            Notes (Optional)
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes about this food..."
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '12px',
                '& fieldset': {
                  borderColor: '#e2e8f0',
                  borderWidth: '1.5px'
                },
                '&:hover fieldset': {
                  borderColor: theme.palette.primary.main
                },
                '&.Mui-focused fieldset': {
                  borderColor: theme.palette.primary.main,
                  borderWidth: '2px'
                }
              }
            }}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, gap: 1.5 }}>
        <Button
          onClick={handleClose}
          variant="outlined"
          size="large"
          sx={{
            borderRadius: '999px',
            px: 3,
            py: 1.25,
            borderColor: theme.palette.divider,
            color: theme.palette.text.secondary,
            fontWeight: 600,
            textTransform: 'none',
            borderWidth: '1.5px',
            '&:hover': {
              borderColor: theme.palette.text.secondary,
              backgroundColor: theme.palette.action.hover,
              borderWidth: '1.5px'
            }
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleAdd}
          variant="contained"
          size="large"
          startIcon={<AddIcon />}
          sx={{
            borderRadius: '999px',
            px: 3,
            py: 1.25,
            fontWeight: 700,
            textTransform: 'none',
          }}
        >
          Add to Log
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddFoodModal;
