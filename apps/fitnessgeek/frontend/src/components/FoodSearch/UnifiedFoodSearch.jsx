import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Grid,
  Alert,
  Collapse,
  Button,
  Skeleton,
  Chip
} from '@mui/material';
import {
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  SmartToy as AIIcon,
  AutoAwesome as WandIcon
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import SearchBar from './SearchBar';
import FoodCard from './FoodCard';
import AddFoodModal from './AddFoodModal';
import StagingTray from './StagingTray';
import { foodService } from '../../services/foodService';
import { fitnessGeekService } from '../../services/fitnessGeekService';

/**
 * Generate a unique stage ID for an item in the tray.
 * Multiple identical foods can coexist as separate entries (one per stage event).
 */
let stageSeq = 0;
const nextStageId = () => `stage_${Date.now()}_${++stageSeq}`;

/**
 * A stable identity key for a food result — used only to compute "staged count" badges on cards.
 * Does NOT uniquely identify tray items (which have their own stageId).
 */
const getFoodIdentity = (food) => {
  if (!food) return '';
  return (
    food._id ||
    food.id ||
    `${food.source || 'unknown'}::${food.compositeItem || ''}::${food.name || ''}::${food.compositeIndex ?? ''}`
  );
};

const UnifiedFoodSearch = ({
  // Behavior
  mode = 'page',
  defaultMealType = 'snack',

  // Features
  showRecent = true,
  showBarcode = true,

  // Callbacks
  onCommitBatch, // (items: TrayItem[]) => Promise<{ok:number, fail:number}>
  onBarcodeClick,

  // Customization
  placeholder = "Search foods or describe your meal (e.g., '2 tacos and a beer')...",
  maxResults = 25,
  className
}) => {
  const theme = useTheme();
  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const primary = theme.palette.primary.main;

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [recentFoods, setRecentFoods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasAIResults, setHasAIResults] = useState(false);
  const [showRecentSection, setShowRecentSection] = useState(true);
  const [showMoreResults, setShowMoreResults] = useState(false);

  // ─── Tray state: the new batch primitive ───
  // Each tray item: { stageId, identityKey, ...food, servings }
  const [trayItems, setTrayItems] = useState([]);
  const [committing, setCommitting] = useState(false);

  // For editing a single item's precise macros (still routes through modal)
  const [modalFood, setModalFood] = useState(null);

  // Tray identity index → used to badge cards and count duplicates
  const trayIndex = useMemo(() => {
    const map = new Map();
    for (const item of trayItems) {
      const key = item.identityKey;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [trayItems]);

  // Auto-clear results when query emptied
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setHasAIResults(false);
    }
  }, [searchQuery]);

  // Load recent foods
  useEffect(() => {
    if (showRecent) loadRecentFoods();
  }, [showRecent]);

  const loadRecentFoods = async () => {
    try {
      const recent = await fitnessGeekService.getRecentLogs();
      if (recent && recent.length > 0) {
        const uniqueFoods = recent.reduce((acc, log) => {
          const food = log.food_item || log.food_item_id;
          if (food && !acc.find((f) => f._id === food._id || f.id === food.id)) {
            acc.push(food);
          }
          return acc;
        }, []);
        setRecentFoods(uniqueFoods.slice(0, 10));
      }
    } catch (err) {
      console.error('Failed to load recent foods:', err);
    }
  };

  const searchFoods = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    setHasAIResults(false);

    try {
      const foods = await foodService.search(searchQuery, {
        limit: maxResults,
        includeAI: true
      });

      const aiResults = (foods || []).filter((f) => f.source === 'ai');
      setHasAIResults(aiResults.length > 0);

      let meals = [];
      try {
        meals = await fitnessGeekService.getMeals(null, searchQuery);
      } catch {
        // Meals search is optional
      }

      const mappedMeals = (meals || []).map((m) => {
        const totalCals = (m.food_items || []).reduce((sum, it) => {
          const f = it.food_item_id || it.food_item || {};
          const c = f?.nutrition?.calories_per_serving || 0;
          return sum + c * (it.servings || 1);
        }, 0);
        return {
          _id: m._id,
          name: m.name,
          source: 'meal',
          type: 'meal',
          nutrition: { calories_per_serving: Math.round(totalCals) }
        };
      });

      setSearchResults([...(mappedMeals || []), ...(foods || [])]);
      setShowMoreResults(false);
    } catch (err) {
      console.error('Search error:', err);
      setError(err.message || 'Failed to search foods. Please try again.');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = () => {
    if (searchQuery.length >= 2) searchFoods();
  };

  // ─── Tray ops ───

  const stageFood = (food) => {
    // Saved meals shouldn't be staged — they commit atomically as a meal.
    if (food?.type === 'meal') {
      // Bypass the tray: meals route directly through onCommitBatch as a single-item batch
      // so the parent handler can distinguish (via item.type === 'meal').
      setCommitting(true);
      onCommitBatch?.([
        {
          stageId: nextStageId(),
          identityKey: getFoodIdentity(food),
          ...food,
          servings: 1
        }
      ])
        .catch((e) => setError(e?.message || 'Failed to log meal'))
        .finally(() => setCommitting(false));
      return;
    }

    const defaultServings =
      food.requestedQuantity && Number(food.requestedQuantity) > 0
        ? Number(food.requestedQuantity)
        : food.serving?.size && Number(food.serving.size) > 0 && Number(food.serving.size) <= 10
        ? Number(food.serving.size)
        : 1;

    setTrayItems((prev) => [
      ...prev,
      {
        stageId: nextStageId(),
        identityKey: getFoodIdentity(food),
        ...food,
        servings: defaultServings
      }
    ]);
  };

  const unstageFood = (food) => {
    // Remove the most recently staged entry matching this identity
    setTrayItems((prev) => {
      const key = getFoodIdentity(food);
      const lastIdx = prev
        .map((item, idx) => ({ item, idx }))
        .reverse()
        .find(({ item }) => item.identityKey === key)?.idx;
      if (lastIdx == null) return prev;
      return [...prev.slice(0, lastIdx), ...prev.slice(lastIdx + 1)];
    });
  };

  const handleCardTap = (food) => {
    const key = getFoodIdentity(food);
    const isAlreadyStaged = trayIndex.has(key);
    if (isAlreadyStaged) {
      unstageFood(food);
    } else {
      stageFood(food);
    }
  };

  const updateServings = (stageId, servings) => {
    setTrayItems((prev) =>
      prev.map((item) => (item.stageId === stageId ? { ...item, servings } : item))
    );
  };

  const removeFromTray = (stageId) => {
    setTrayItems((prev) => prev.filter((item) => item.stageId !== stageId));
  };

  const clearTray = () => setTrayItems([]);

  const commitTray = async () => {
    if (trayItems.length === 0 || committing) return;
    setCommitting(true);
    setError(null);
    try {
      const result = await onCommitBatch?.(trayItems);
      if (result && result.fail > 0) {
        setError(
          `Logged ${result.ok} item${result.ok !== 1 ? 's' : ''}, ${result.fail} failed. Check your connection and try again.`
        );
      }
      // On success, clear the tray
      if (!result || result.fail === 0) {
        setTrayItems([]);
      }
    } catch (e) {
      setError(e?.message || 'Failed to log items');
    } finally {
      setCommitting(false);
    }
  };

  // ─── Rendering helpers ───

  const renderLoadingSkeletons = () => (
    <Grid container spacing={2}>
      {[1, 2, 3, 4].map((i) => (
        <Grid item xs={12} sm={6} md={mode === 'page' ? 4 : 6} key={i}>
          <Skeleton variant="rectangular" height={160} sx={{ borderRadius: '16px' }} />
        </Grid>
      ))}
    </Grid>
  );

  const isCompositeResult = (foods) =>
    foods && foods.length > 0 && foods.some((food) => Boolean(food.compositeItem));

  const groupCompositeResults = (foods) => {
    const groups = [];
    let currentGroup = null;
    for (const food of foods) {
      if (!currentGroup || currentGroup.item !== food.compositeItem) {
        currentGroup = {
          item: food.compositeItem,
          quantity: food.requestedQuantity,
          unit: food.requestedUnit,
          foods: []
        };
        groups.push(currentGroup);
      }
      currentGroup.foods.push(food);
    }
    return groups;
  };

  const renderFoodCard = (food, index) => {
    const identity = getFoodIdentity(food);
    const stagedCount = trayIndex.get(identity) || 0;
    return (
      <Grid item xs={12} sm={6} md={mode === 'page' ? 4 : 6} key={`${identity}_${index}`}>
        <FoodCard
          food={food}
          onClick={handleCardTap}
          staged={stagedCount > 0}
          stagedCount={stagedCount}
          animationDelay={index * 40}
        />
      </Grid>
    );
  };

  const renderCompositeResults = (foods) => {
    const groups = groupCompositeResults(foods);

    return (
      <Box sx={{ mb: 3 }}>
        {/* Editorial header */}
        <Box sx={{ mb: 2.5 }}>
          <Typography
            sx={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              color: muted,
              mb: 0.5
            }}
          >
            AI Parsed · {groups.length} Item{groups.length !== 1 ? 's' : ''}
          </Typography>
          <Typography
            component="h2"
            sx={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: { xs: '1.5rem', sm: '1.875rem' },
              fontWeight: 400,
              lineHeight: 1.1,
              color: ink,
              letterSpacing: '-0.015em'
            }}
          >
            Your Meal, Broken Down
          </Typography>
        </Box>

        {groups.map((group, groupIdx) => (
          <Box key={groupIdx} sx={{ mb: 3.5 }}>
            {/* Group heading — serif + chip, clear hierarchy */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                mb: 1.5,
                pb: 1,
                borderBottom: `2px solid ${ink}`,
                position: 'relative'
              }}
            >
              <Typography
                sx={{
                  fontFamily: "'DM Serif Display', serif",
                  fontSize: '1.25rem',
                  fontWeight: 400,
                  color: ink,
                  textTransform: 'capitalize',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {group.item}
              </Typography>
              <Chip
                label={`${group.quantity || 1} ${group.unit || ''}`.trim()}
                size="small"
                sx={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'lowercase',
                  height: 22,
                  backgroundColor: alpha(ink, 0.08),
                  color: ink,
                  border: `1px solid ${alpha(ink, 0.15)}`,
                  borderRadius: '999px'
                }}
              />
            </Box>

            <Grid container spacing={2}>
              {group.foods.map((food, idx) => renderFoodCard(food, groupIdx * 10 + idx))}
            </Grid>
          </Box>
        ))}
      </Box>
    );
  };

  const renderFoodGrid = (foods, title, showTitle = true, startIndex = 0) => {
    if (!foods || foods.length === 0) return null;
    return (
      <Box sx={{ mb: 3 }}>
        {showTitle && title && (
          <Typography
            component="h3"
            sx={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: '1.125rem',
              fontWeight: 400,
              color: ink,
              mb: 1.5,
              letterSpacing: '-0.01em'
            }}
          >
            {title}
          </Typography>
        )}
        <Grid container spacing={2}>
          {foods.map((food, idx) => renderFoodCard(food, startIndex + idx))}
        </Grid>
      </Box>
    );
  };

  return (
    <Box
      className={className}
      sx={{
        // Leave breathing room at the bottom so the sticky tray never covers content
        pb: trayItems.length > 0 ? { xs: 2, sm: 3 } : 0
      }}
    >
      {/* Search bar */}
      <SearchBar
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onSubmit={handleSearchSubmit}
        onBarcodeClick={showBarcode ? onBarcodeClick : null}
        loading={loading}
        placeholder={placeholder}
        autoFocus={mode === 'dialog'}
      />

      {/* Editorial stage hint — only when tray is empty and no results */}
      {trayItems.length === 0 && searchQuery.length < 2 && recentFoods.length === 0 && !loading && (
        <Box
          sx={{
            mt: 3,
            px: 3,
            py: 5,
            textAlign: 'center',
            borderRadius: 3,
            border: `1px dashed ${alpha(ink, 0.18)}`,
            backgroundColor: alpha(ink, theme.palette.mode === 'dark' ? 0.04 : 0.02)
          }}
        >
          <WandIcon sx={{ fontSize: 32, color: primary, mb: 1.5 }} />
          <Typography
            sx={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: '1.5rem',
              fontWeight: 400,
              color: ink,
              mb: 0.5,
              letterSpacing: '-0.01em'
            }}
          >
            Describe your meal
          </Typography>
          <Typography sx={{ color: muted, fontSize: '0.9375rem', maxWidth: 360, mx: 'auto' }}>
            Try something like “2 chicken tacos, chips, and a margarita” — we'll break it down and
            let you stage each item on your tray.
          </Typography>
        </Box>
      )}

      {/* AI indicator */}
      {hasAIResults && !loading && (
        <Alert
          severity="info"
          icon={<AIIcon />}
          sx={{
            mt: 2,
            mb: 2,
            borderRadius: 2,
            backgroundColor: alpha(primary, 0.08),
            border: `1px solid ${alpha(primary, 0.22)}`,
            '& .MuiAlert-icon': { color: primary },
            '& .MuiAlert-message': {
              fontSize: '0.875rem',
              color: ink
            }
          }}
        >
          AI parsed your description. Tap any card to stage it — you can build a full meal before logging.
        </Alert>
      )}

      {/* Error */}
      {error && (
        <Alert
          severity="error"
          onClose={() => setError(null)}
          sx={{
            mt: 2,
            mb: 2,
            borderRadius: 2,
            backgroundColor: alpha(theme.palette.error.main, 0.08),
            border: `1px solid ${alpha(theme.palette.error.main, 0.22)}`
          }}
        >
          {error}
        </Alert>
      )}

      {/* Results */}
      {searchQuery.length >= 2 && (
        <Box sx={{ mt: 2, mb: 3 }}>
          {loading ? (
            renderLoadingSkeletons()
          ) : searchResults.length > 0 ? (
            isCompositeResult(searchResults) ? (
              renderCompositeResults(searchResults)
            ) : (
              (() => {
                const mealResults = searchResults.filter((r) => r.type === 'meal');
                const foodResults = searchResults.filter((r) => r.type !== 'meal');

                const rankedFoods = [...foodResults].sort((a, b) => {
                  const rankA = typeof a.sanityRank === 'number' ? a.sanityRank : Number.MAX_SAFE_INTEGER;
                  const rankB = typeof b.sanityRank === 'number' ? b.sanityRank : Number.MAX_SAFE_INTEGER;
                  if (rankA !== rankB) return rankA - rankB;
                  const scoreA = typeof a.aiRelevanceScore === 'number' ? a.aiRelevanceScore : 0;
                  const scoreB = typeof b.aiRelevanceScore === 'number' ? b.aiRelevanceScore : 0;
                  return scoreB - scoreA;
                });

                const bestMatches = rankedFoods.slice(0, Math.min(3, rankedFoods.length));
                const moreMatches = rankedFoods.slice(bestMatches.length);

                return (
                  <>
                    {mealResults.length > 0 && renderFoodGrid(mealResults, 'Saved Meals', true, 0)}
                    {bestMatches.length > 0 &&
                      renderFoodGrid(bestMatches, 'Best Matches', true, mealResults.length)}
                    {moreMatches.length > 0 && (
                      <Box sx={{ mb: 3 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            mb: 1.5
                          }}
                        >
                          <Typography
                            component="h3"
                            sx={{
                              fontFamily: "'DM Serif Display', serif",
                              fontSize: '1.125rem',
                              fontWeight: 400,
                              color: ink,
                              letterSpacing: '-0.01em'
                            }}
                          >
                            More Results
                          </Typography>
                          <Button
                            size="small"
                            onClick={() => setShowMoreResults((prev) => !prev)}
                            endIcon={showMoreResults ? <CollapseIcon /> : <ExpandIcon />}
                            sx={{
                              textTransform: 'uppercase',
                              fontWeight: 700,
                              fontSize: '0.6875rem',
                              letterSpacing: '0.12em',
                              color: muted
                            }}
                          >
                            {showMoreResults ? 'Hide' : `Show ${moreMatches.length}`}
                          </Button>
                        </Box>
                        <Collapse in={showMoreResults}>
                          {renderFoodGrid(
                            moreMatches,
                            '',
                            false,
                            mealResults.length + bestMatches.length
                          )}
                        </Collapse>
                      </Box>
                    )}
                  </>
                );
              })()
            )
          ) : (
            <Box
              sx={{
                textAlign: 'center',
                py: 6,
                px: 3,
                borderRadius: 3,
                border: `1px dashed ${alpha(ink, 0.18)}`,
                backgroundColor: alpha(ink, theme.palette.mode === 'dark' ? 0.04 : 0.02)
              }}
            >
              <Typography
                sx={{
                  fontFamily: "'DM Serif Display', serif",
                  fontSize: '1.25rem',
                  color: ink,
                  mb: 0.5
                }}
              >
                Nothing found
              </Typography>
              <Typography sx={{ color: muted, fontSize: '0.875rem' }}>
                Try a different phrase or scan a barcode
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Recent foods */}
      {showRecent && recentFoods.length > 0 && searchQuery.length < 2 && (
        <Box sx={{ mt: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1.5
            }}
          >
            <Typography
              component="h3"
              sx={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: '1.125rem',
                fontWeight: 400,
                color: ink,
                letterSpacing: '-0.01em'
              }}
            >
              Recent Foods
            </Typography>
            <Button
              onClick={() => setShowRecentSection(!showRecentSection)}
              endIcon={showRecentSection ? <CollapseIcon /> : <ExpandIcon />}
              sx={{
                color: muted,
                textTransform: 'uppercase',
                fontWeight: 700,
                fontSize: '0.6875rem',
                letterSpacing: '0.12em'
              }}
            >
              {showRecentSection ? 'Hide' : 'Show'}
            </Button>
          </Box>

          <Collapse in={showRecentSection}>{renderFoodGrid(recentFoods, '', false, 0)}</Collapse>
        </Box>
      )}

      {/* ─── The staging tray (bottom dock) ─── */}
      <StagingTray
        items={trayItems}
        mealType={defaultMealType}
        onUpdateServings={updateServings}
        onRemove={removeFromTray}
        onClear={clearTray}
        onCommit={commitTray}
        committing={committing}
      />

      {/* Legacy modal — kept for precision macro editing flows (not used by search tap) */}
      <AddFoodModal
        open={!!modalFood}
        onClose={() => setModalFood(null)}
        food={modalFood}
        onAdd={(foodWithSettings) => {
          // If modal is used, treat it as a direct one-off: stage then immediately commit
          stageFood(foodWithSettings);
          setModalFood(null);
        }}
        defaultMealType={defaultMealType}
      />
    </Box>
  );
};

export default UnifiedFoodSearch;
