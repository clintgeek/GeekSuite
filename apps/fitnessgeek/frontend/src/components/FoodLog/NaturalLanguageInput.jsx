import React, { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Chip,
  Paper
} from '@mui/material';
import {
  SmartToy as AIIcon,
  Send as SendIcon,
  Restaurant as FoodIcon
} from '@mui/icons-material';
import { aiService } from '../../services/aiService.js';
// QuantityUnitPicker removed for AI-specified serving sizes
import SwapDialog from './SwapDialog.jsx';
import { matcherService } from '../../services/matcherService.js';
import ReasonablenessBanner from './ReasonablenessBanner.jsx';

const NaturalLanguageInput = ({ onFoodsParsed, onError }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [parsedFoods, setParsedFoods] = useState(null);
  const [error, setError] = useState('');
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapCandidates, setSwapCandidates] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    setIsLoading(true);
    setError('');
    setParsedFoods(null);

    try {
      const result = await aiService.parseFoodDescription(input.trim());
      setParsedFoods(result);
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmFoods = () => {
    if (parsedFoods && parsedFoods.food_items) {
      onFoodsParsed(parsedFoods.food_items);
      setInput('');
      setParsedFoods(null);
      setError('');
    }
  };

  const handleClear = () => {
    setInput('');
    setParsedFoods(null);
    setError('');
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Input Form */}
      <Box component="form" onSubmit={handleSubmit} sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            fullWidth
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your food (e.g., '2 chicken tacos and a dos equis')"
            variant="outlined"
            size="medium"
            disabled={isLoading}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'primary.main'
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'primary.main'
                }
              }
            }}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={!input.trim() || isLoading}
            startIcon={isLoading ? <CircularProgress size={20} /> : <AIIcon />}
            sx={{
              bgcolor: 'primary.main',
              '&:hover': {
                bgcolor: 'primary.dark'
              },
              minWidth: 'auto',
              px: 2,
              height: 56
            }}
          >
            {isLoading ? '' : 'Parse'}
          </Button>
        </Box>
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Parsed Results */}
      {parsedFoods && (
        <Paper sx={{ p: 2, mb: 2, bgcolor: '#f8f9fa' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <AIIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              AI Parsed Results
            </Typography>
            <Chip
              label={`${parsedFoods.confidence} confidence`}
              size="small"
              color={parsedFoods.confidence === 'high' ? 'success' : parsedFoods.confidence === 'medium' ? 'warning' : 'error'}
            />
          </Box>

          {/* Parsed Food Items */}
          {parsedFoods.food_items.map((food, index) => (
            <Box key={index} sx={{ mb: 2, p: 2, bgcolor: 'white', borderRadius: 1, border: '1px solid #e0e0e0' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <FoodIcon sx={{ color: '#4caf50', fontSize: 20 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {food.name}
                </Typography>
                <Chip
                  label={`${food.servings} ${food.estimated_serving_size}`}
                  size="small"
                  variant="outlined"
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ color: '#4caf50', fontWeight: 600 }}>
                  {Math.round(food.nutrition.calories_per_serving)} cal
                </Typography>
                <Typography variant="body2" sx={{ color: '#666' }}>
                  P: {food.nutrition.protein_grams}g
                </Typography>
                <Typography variant="body2" sx={{ color: '#666' }}>
                  C: {food.nutrition.carbs_grams}g
                </Typography>
                <Typography variant="body2" sx={{ color: '#666' }}>
                  F: {food.nutrition.fat_grams}g
                </Typography>
              </Box>

              {/* Servings picker using AI-specified serving size */}
              <Box sx={{ mt: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  type="number"
                  size="small"
                  label="Servings"
                  value={food.servings || 1}
                  onChange={(e) => {
                    const updated = { ...parsedFoods };
                    updated.food_items[index] = { ...food, servings: Number(e.target.value) };
                    setParsedFoods(updated);
                  }}
                  sx={{ width: 120 }}
                />
                <Chip label={food.estimated_serving_size || 'serving'} size="small" />
              </Box>

              {/* Reasonableness check */}
              <ReasonablenessBanner
                name={food.name}
                calories={(food.nutrition?.calories_per_serving || 0) * (food.servings || 1)}
                grams={0}
              />

              {/* Swap candidates trigger (placeholder) */}
              <Box sx={{ mt: 1 }}>
                <Button size="small" variant="text" onClick={async () => {
                  const candidates = await matcherService.matchCandidates({ name: food.name, modifiers: food.modifiers || {} }, 10);
                  setSwapCandidates(candidates);
                  setSwapOpen(true);
                }}>Swap</Button>
              </Box>
            </Box>
          ))}

          {/* Total Summary */}
          <Box sx={{ p: 2, bgcolor: 'white', borderRadius: 1, border: '1px solid #e0e0e0' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Total Estimated: {parsedFoods.estimated_calories} calories
            </Typography>
            <Typography variant="body2" sx={{ color: '#666' }}>
              Meal type: {parsedFoods.meal_type}
            </Typography>
          </Box>

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <Button
              onClick={handleConfirmFoods}
              variant="contained"
              startIcon={<SendIcon />}
              sx={{
                bgcolor: '#4caf50',
                '&:hover': {
                  bgcolor: '#45a049'
                }
              }}
            >
              Add All Foods
            </Button>
            <Button
              onClick={handleClear}
              variant="outlined"
              sx={{
                borderColor: '#666',
                color: '#666',
                '&:hover': {
                  borderColor: '#333',
                  backgroundColor: '#f5f5f5'
                }
              }}
            >
              Clear
            </Button>
          </Box>
        </Paper>
      )}

      <SwapDialog open={swapOpen} candidates={swapCandidates} onClose={() => setSwapOpen(false)} onSelect={(c) => {
        setSwapOpen(false);
        // Replace the last opened item by name match fallback
        if (parsedFoods?.food_items?.length) {
          const updated = { ...parsedFoods };
          const idx = updated.food_items.findIndex((f) => f.name === (swapCandidates?.[0]?.name) || f.name);
          const target = idx >= 0 ? idx : 0;
          updated.food_items[target] = {
            ...updated.food_items[target],
            name: c.name,
            brand: c.brand,
            source: c.source,
            serving: c.serving,
            nutrition: c.nutrition,
          };
          setParsedFoods(updated);
        }
      }} />

      {/* Help Text */}
      <Typography variant="body2" sx={{ color: '#666', fontStyle: 'italic' }}>
        💡 Try describing your food naturally: "2 chicken tacos and a dos equis", "pizza slice and coke", "protein shake with banana"
      </Typography>
    </Box>
  );
};

export default NaturalLanguageInput;
