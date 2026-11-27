import React, { useState } from 'react';
import { Box, Button, IconButton, Menu, MenuItem, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Add as AddIcon, MoreHoriz as MoreIcon } from '@mui/icons-material';
import EggAltIcon from '@mui/icons-material/EggAlt';
import LunchDiningIcon from '@mui/icons-material/LunchDining';
import DinnerDiningIcon from '@mui/icons-material/DinnerDining';
import CookieIcon from '@mui/icons-material/Cookie';
import { MEAL_ORDER, mealColors } from '../../theme/theme.jsx';
import { mealLabel, mealWord } from '../../utils/plainWords.js';
import { Surface } from '../primitives';
import FoodLogItem from '../FoodLog/FoodLogItem.jsx';
import { caloriesOf } from '../FoodLog/amount.js';
import { logsByMeal } from './mealGroups.js';

const MEAL_ICON = { breakfast: EggAltIcon, lunch: LunchDiningIcon, dinner: DinnerDiningIcon, snack: CookieIcon };

/**
 * The day's meals (DOCS/ONE_APP_PLAN.md §1.5): ONE card holding a grouped
 * list — a row per meal with its dot, name, calories, "Add" and a small
 * "more" menu, and its foods listed under it — so the day reads top to
 * bottom instead of as four boxes.
 *
 * A meal's own "Add" opens the add sheet already set to that meal, so there
 * is no separate meal picker to get wrong. Its "more" menu holds the two
 * things done once in a while: Copy from another day, and Save as a meal
 * (only when the meal has something in it). A food row opens Edit.
 *
 * Each meal has a small picture in its own colour (an egg, a sandwich, a
 * dinner plate, a cookie) on a pale round of the same colour. Decoration:
 * the meal's name is always beside it.
 */
function MealCard({ mealType, logs = [], onAdd, onEdit, onCopy, onSaveMeal, justAdded = null, unknown = false }) {
  const theme = useTheme();
  const [menuAt, setMenuAt] = useState(null);
  const colour = mealColors(mealType, theme.palette.mode);
  const MealIcon = MEAL_ICON[mealType] || CookieIcon;
  const label = mealLabel(mealType);
  const meal = mealWord(mealType);
  const total = logs.reduce((sum, log) => sum + caloriesOf(log), 0);
  // A meal that couldn't be read is unknown ("—"), never "Nothing yet".
  const amount = unknown ? '—' : logs.length === 0 ? 'Nothing yet' : `${total.toLocaleString('en-US')} cal`;
  const hasRows = logs.length > 0;
  const closeMenu = () => setMenuAt(null);

  return (
    <Box
      component="section"
      id={`meal-card-${mealType}`}
      aria-labelledby={`meal-card-${mealType}-title`}
      data-testid={`meal-card-${mealType}`}
      sx={{
        // Clear of the sticky top bar when the page scrolls a meal into view.
        scrollMarginTop: 88,
        px: { xs: 4, sm: 5 },
        py: 2,
        '& + &': { borderTop: `1px solid ${theme.palette.divider}` },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 44 }}>
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
            <Box aria-hidden sx={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: colour.tint }}>
              <MealIcon sx={{ fontSize: 16, color: colour.fill }} />
            </Box>
            <Typography
              id={`meal-card-${mealType}-title`}
              component="h3"
              sx={{ fontSize: '1.0625rem', fontWeight: 600, lineHeight: 1.2, color: 'text.primary' }}
            >
              {label}
            </Typography>
          </Box>
          <Typography
            data-testid={`meal-total-${mealType}`}
            sx={{
              fontSize: hasRows ? '1rem' : '0.9375rem',
              fontWeight: hasRows ? 600 : 400,
              whiteSpace: 'nowrap',
              color: hasRows ? 'text.primary' : 'text.secondary',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {amount}
          </Typography>
        </Box>
        <Button
          onClick={() => onAdd?.(mealType)}
          startIcon={<AddIcon aria-hidden />}
          aria-label={`Add to ${meal}`}
          variant="tonal"
          size="small"
          sx={{ flexShrink: 0, minHeight: 44, fontSize: '0.9375rem', fontWeight: 600, textTransform: 'none' }}
        >
          Add
        </Button>
        {(onCopy || onSaveMeal) && (
          <>
            <IconButton
              aria-label={`More for ${meal}`}
              aria-haspopup="menu"
              aria-expanded={Boolean(menuAt)}
              data-testid={`meal-more-${mealType}`}
              onClick={(e) => setMenuAt(e.currentTarget)}
              sx={{ width: 44, height: 44, mr: -2, flexShrink: 0, color: 'text.secondary' }}
            >
              <MoreIcon />
            </IconButton>
            <Menu anchorEl={menuAt} open={Boolean(menuAt)} onClose={closeMenu}>
              {onCopy && (
                <MenuItem sx={{ minHeight: 48 }} onClick={() => { closeMenu(); onCopy(mealType); }}>
                  Copy from another day
                </MenuItem>
              )}
              {onSaveMeal && (
                <MenuItem
                  sx={{ minHeight: 48 }}
                  disabled={!hasRows}
                  onClick={() => { if (!hasRows) return; closeMenu(); onSaveMeal(mealType, logs); }}
                >
                  Save as a meal
                </MenuItem>
              )}
            </Menu>
          </>
        )}
      </Box>

      {/* "Just added": what a describe put here, with Fix and Undo, until the next action. */}
      {justAdded && <Box sx={{ py: 1 }}>{justAdded}</Box>}

      {hasRows && (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, pl: 9, pb: 1 }}>
          {logs.map((log, i) => (
            <Box component="li" key={log.id || log._id || i}>
              <FoodLogItem log={log} onEdit={onEdit} />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/**
 * `logs` are the day's raw entries. `justAdded` is useJustAdded()'s value:
 * the meal a describe landed on carries a "Just added" strip with Fix and
 * Undo until the next action. `unknown` (review L1): the day couldn't be
 * read and there is nothing from before to show, so no meal claims "Nothing
 * yet".
 */
export default function MealCards({ logs = [], onAdd, onEdit, onCopy, onSaveMeal, date, justAdded = null, unknown = false }) {
  const groups = logsByMeal(logs);
  return (
    <Surface data-testid="meal-cards" padded={false} sx={{ py: 1 }}>
      {MEAL_ORDER.map((mealType) => (
        <MealCard
          key={mealType}
          mealType={mealType}
          logs={groups[mealType]}
          onAdd={onAdd}
          onEdit={onEdit}
          onCopy={onCopy}
          onSaveMeal={onSaveMeal}
          justAdded={justAdded?.renderFor?.(mealType, date) || null}
          unknown={unknown}
        />
      ))}
    </Surface>
  );
}
