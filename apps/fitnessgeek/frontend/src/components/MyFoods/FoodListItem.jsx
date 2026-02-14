import React from 'react';
import {
  Box,
  Typography,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  IconButton,
  Chip
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { getSourceIcon, getSourceColor, getSourceName } from './FoodSourceUtils.jsx';

const FoodListItem = ({ food, onEdit, onDelete }) => {
  const sourceColor = getSourceColor(food.source);
  const sourceIcon = getSourceIcon(food.source);

  return (
    <ListItem
      sx={{
        border: '1px solid #e0e0e0',
        borderRadius: 1,
        mb: 1,
        backgroundColor: '#ffffff',
        '&:hover': {
          backgroundColor: '#f5f5f5'
        }
      }}
    >
      <ListItemAvatar>
        <Avatar sx={{ bgcolor: `${sourceColor}20`, color: sourceColor }}>
          {sourceIcon}
        </Avatar>
      </ListItemAvatar>

      <ListItemText
        primary={
          <Box>
            <Typography variant="body2" fontWeight={600} noWrap>
              {food.name}
            </Typography>
            {food.brand && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {food.brand}
              </Typography>
            )}
          </Box>
        }
        secondaryTypographyProps={{
          component: 'div'
        }}
        secondary={
          <Box sx={{ mt: 0.5 }}>
            <Box sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
              <Typography variant="caption" fontWeight={600}>
                {Math.round(food.nutrition.calories_per_serving)} cal
              </Typography>
              <Typography variant="caption" color="text.secondary">
                P: {food.nutrition.protein_grams}g
              </Typography>
              <Typography variant="caption" color="text.secondary">
                C: {food.nutrition.carbs_grams}g
              </Typography>
              <Typography variant="caption" color="text.secondary">
                F: {food.nutrition.fat_grams}g
              </Typography>
            </Box>
            <Chip
              label={getSourceName(food.source)}
              size="small"
              sx={{
                backgroundColor: `${sourceColor}15`,
                color: sourceColor,
                fontSize: '0.625rem',
                height: 20
              }}
            />
          </Box>
        }
      />

      <ListItemSecondaryAction>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            edge="end"
            onClick={() => onEdit(food)}
            sx={{ color: 'primary.main' }}
            size="small"
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            edge="end"
            onClick={() => onDelete(food)}
            sx={{ color: 'error.main' }}
            size="small"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      </ListItemSecondaryAction>
    </ListItem>
  );
};

export default FoodListItem;
