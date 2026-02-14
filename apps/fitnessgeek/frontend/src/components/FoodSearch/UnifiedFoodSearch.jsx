import React, { useState, useEffect } from 'react';
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
  SmartToy as AIIcon
} from '@mui/icons-material';
import SearchBar from './SearchBar';
import FoodCard from './FoodCard';
import AddFoodModal from './AddFoodModal';
import { foodService } from '../../services/foodService';
import { fitnessGeekService } from '../../services/fitnessGeekService';

const UnifiedFoodSearch = ({
  // Behavior
  mode = 'page', // 'page' | 'dialog' | 'inline'
  autoAdd = false, // Auto-add to log vs show modal
  defaultMealType = 'snack',

  // Features
  showRecent = true,
  showBarcode = true,
  showQuickAdd = true,

  // Callbacks
  onFoodSelect,
  onBarcodeClick,

  // Customization
  placeholder = "Search foods or describe your meal (e.g., '2 tacos and a beer')...",
  maxResults = 25,
  className
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [recentFoods, setRecentFoods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFood, setSelectedFood] = useState(null);
  const [showRecentSection, setShowRecentSection] = useState(true);
  const [hasAIResults, setHasAIResults] = useState(false);
  const [selectedCompositeFoods, setSelectedCompositeFoods] = useState({});
  const [pendingSelectionQueue, setPendingSelectionQueue] = useState([]);
  const [showMoreResults, setShowMoreResults] = useState(false);

  // Clear results when query is cleared
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setHasAIResults(false);
      setSelectedCompositeFoods({});
      setPendingSelectionQueue([]);
    }
  }, [searchQuery]);

  // Handle search submit
  const handleSearchSubmit = () => {
    if (searchQuery.length >= 2) {
      searchFoods();
    }
  };

  const handleAddAllSelected = () => {
    const selections = getAllSelectedFoodsOrdered();
    console.log('[MultiAdd] handleAddAllSelected called', {
      selectionCount: selections.length,
      selections: selections.map(f => f.name)
    });
    if (selections.length === 0) return;

    setSelectedCompositeFoods({});
    setPendingSelectionQueue(selections.slice(1));
    console.log('[MultiAdd] Queue set to:', selections.slice(1).map(f => f.name));
    setSelectedFood({
      ...selections[0],
      servings: selections[0].serving?.size || selections[0].requestedQuantity || selections[0].servings || 1,
    });
    console.log('[MultiAdd] First food set to:', selections[0].name);
  };

  // Load recent foods on mount
  useEffect(() => {
    if (showRecent) {
      loadRecentFoods();
    }
  }, [showRecent]);

  const searchFoods = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    setHasAIResults(false);

    try {
      // Use unified food service - backend handles AI fallback
      const foods = await foodService.search(searchQuery, {
        limit: maxResults,
        includeAI: true
      });

      // Check if any results came from AI
      const aiResults = (foods || []).filter(f => f.source === 'ai');
      setHasAIResults(aiResults.length > 0);

      // Also search saved meals
      let meals = [];
      try {
        meals = await fitnessGeekService.getMeals(null, searchQuery);
      } catch {
        // Meals search is optional
      }

      // Map meals to food format
      const mappedMeals = (meals || []).map((m) => {
        const totalCals = (m.food_items || []).reduce((sum, it) => {
          const f = it.food_item_id || it.food_item || {};
          const c = f?.nutrition?.calories_per_serving || 0;
          return sum + (c * (it.servings || 1));
        }, 0);
        return {
          _id: m._id,
          name: m.name,
          source: 'meal',
          type: 'meal',
          nutrition: { calories_per_serving: Math.round(totalCals) }
        };
      });

      // Show saved meals first, then foods
      setSearchResults([...(mappedMeals || []), ...(foods || [])]);
      setSelectedCompositeFoods({});
      setPendingSelectionQueue([]);
      setShowMoreResults(false);
    } catch (err) {
      console.error('Search error:', err);
      setError(err.message || 'Failed to search foods. Please try again.');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const getFoodKey = (food) => {
    return food._id || food.id || `${food.source || 'unknown'}_${food.compositeItem || ''}_${food.name}_${food.requestedQuantity || ''}_${food.compositeIndex || ''}`;
  };

  const toggleCompositeSelection = (food) => {
    const key = getFoodKey(food);
    setSelectedCompositeFoods((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = food;
      }
      return next;
    });
  };

  const getSelectedFoodsForGroup = (groupItem) => {
    return Object.values(selectedCompositeFoods).filter((food) => food.compositeItem === groupItem);
  };

  const getAllSelectedFoodsOrdered = () => {
    return Object.values(selectedCompositeFoods).sort((a, b) => {
      const aIndex = typeof a.compositeIndex === 'number' ? a.compositeIndex : Number.MAX_SAFE_INTEGER;
      const bIndex = typeof b.compositeIndex === 'number' ? b.compositeIndex : Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  };

  const handleAddSelectedFromGroup = (groupItem) => {
    const selections = getSelectedFoodsForGroup(groupItem);
    if (selections.length === 0) return;
    setSelectedCompositeFoods((prev) => {
      const next = { ...prev };
      selections.forEach((food) => {
        delete next[getFoodKey(food)];
      });
      return next;
    });
    setPendingSelectionQueue(selections.slice(1));
    setSelectedFood({
      ...selections[0],
      servings: selections[0].serving?.size || selections[0].requestedQuantity || selections[0].servings || 1,
    });
  };

  const loadRecentFoods = async () => {
    try {
      const recent = await fitnessGeekService.getRecentLogs();
      if (recent && recent.length > 0) {
        // Get unique foods from recent logs
        const uniqueFoods = recent.reduce((acc, log) => {
          const food = log.food_item || log.food_item_id;
          if (food && !acc.find(f => f._id === food._id || f.id === food.id)) {
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

  const handleFoodClick = (food) => {
    if (autoAdd) {
      // Auto-add with default servings
      onFoodSelect?.({
        ...food,
        servings: food.serving?.size || 1,
        mealType: defaultMealType
      });
    } else {
      // Show modal for customization
      setSelectedFood(food);
    }
  };

  const handleQuickAdd = (food) => {
    // Quick add always adds with defaults
    onFoodSelect?.({
      ...food,
      servings: 1,
      mealType: defaultMealType
    });
  };

  const handleModalAdd = (foodWithSettings) => {
    const batchRemaining = pendingSelectionQueue.length;
    const isBatch = batchRemaining > 0;

    console.log('[MultiAdd] handleModalAdd called', {
      foodName: foodWithSettings.name,
      batchRemaining,
      isBatch,
      queueLength: pendingSelectionQueue.length,
      queue: pendingSelectionQueue.map(f => f.name)
    });

    // Set up next food BEFORE calling parent callback to prevent race condition
    if (pendingSelectionQueue.length > 0) {
      const [next, ...rest] = pendingSelectionQueue;
      console.log('[MultiAdd] Setting up next food:', next.name, 'remaining:', rest.length);
      setPendingSelectionQueue(rest);
      // Use setTimeout to ensure state update happens after current render cycle
      setTimeout(() => {
        console.log('[MultiAdd] setTimeout firing, setting selectedFood to:', next.name);
        setSelectedFood({
          ...next,
          servings: next.serving?.size || next.requestedQuantity || next.servings || 1,
        });
      }, 100);
    } else {
      console.log('[MultiAdd] No more items in queue, clearing selectedFood');
      setSelectedFood(null);
    }

    // Call parent callback after setting up next food
    console.log('[MultiAdd] Calling onFoodSelect with isBatch:', isBatch);
    onFoodSelect?.(foodWithSettings, {
      batchRemaining,
      isBatch
    });
  };

  const handleBarcodeClick = () => {
    onBarcodeClick?.();
  };

  const renderLoadingSkeletons = () => (
    <Grid container spacing={2}>
      {[1, 2, 3, 4].map((i) => (
        <Grid item xs={12} sm={6} md={mode === 'page' ? 4 : 6} key={i}>
          <Skeleton
            variant="rectangular"
            height={160}
            sx={{ borderRadius: '16px' }}
          />
        </Grid>
      ))}
    </Grid>
  );

  // Check if results are grouped composite results
  const isCompositeResult = (foods) => {
    return foods && foods.length > 0 && foods.some((food) => Boolean(food.compositeItem));
  };

  // Group composite results by their item
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

  const renderCompositeResults = (foods) => {
    const groups = groupCompositeResults(foods);

    const totalSelectedCount = Object.keys(selectedCompositeFoods).length;

    return (
      <Box sx={{ mb: 3 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
            gap: 2
          }}
        >
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              color: 'text.primary',
              fontSize: '1.125rem'
            }}
          >
            Search Results
          </Typography>
          <Button
            type="button"
            variant="contained"
            size="small"
            disabled={totalSelectedCount === 0}
            onClick={handleAddAllSelected}
          >
            Add All Selected ({totalSelectedCount})
          </Button>
        </Box>

        {groups.map((group, idx) => (
          <Box key={idx} sx={{ mb: 3 }}>
            {/* Group Header */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 1.5,
                pb: 1,
                borderBottom: '2px solid',
                borderColor: 'primary.main'
              }}
            >
              <Chip
                label={`${group.quantity} ${group.unit}`}
                size="small"
                color="primary"
                sx={{ fontWeight: 600 }}
              />
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 600,
                  color: '#374151',
                  textTransform: 'capitalize'
                }}
              >
                {group.item}
              </Typography>
            </Box>

            {/* Group Foods */}
            <Grid container spacing={2}>
              {group.foods.map((food) => (
                <Grid
                  item
                  xs={12}
                  sm={6}
                  md={mode === 'page' ? 4 : 6}
                  key={food._id || food.id}
                >
                  <FoodCard
                    food={food}
                    onClick={handleFoodClick}
                    onQuickAdd={showQuickAdd ? handleQuickAdd : null}
                    showQuickAdd={showQuickAdd}
                    selectable
                    selected={!!selectedCompositeFoods[getFoodKey(food)]}
                    onSelectToggle={toggleCompositeSelection}
                  />
                </Grid>
              ))}
            </Grid>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
              <Button
                type="button"
                variant="contained"
                size="small"
                disabled={getSelectedFoodsForGroup(group.item).length === 0}
                onClick={() => handleAddSelectedFromGroup(group.item)}
              >
                Add Selected ({getSelectedFoodsForGroup(group.item).length})
              </Button>
            </Box>
          </Box>
        ))}
      </Box>
    );
  };

  const renderFoodGrid = (foods, title, showTitle = true) => {
    if (!foods || foods.length === 0) return null;

    return (
      <Box sx={{ mb: 3 }}>
        {showTitle && (
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              mb: 2,
              color: 'text.primary',
              fontSize: '1.125rem'
            }}
          >
            {title || 'More Results'}
          </Typography>
        )}
        <Grid container spacing={2}>
          {foods.map((food) => (
            <Grid
              item
              xs={12}
              sm={6}
              md={mode === 'page' ? 4 : 6}
              key={food._id || food.id}
            >
              <FoodCard
                food={food}
                onClick={handleFoodClick}
                onQuickAdd={showQuickAdd ? handleQuickAdd : null}
                showQuickAdd={showQuickAdd}
              />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  };

  return (
    <Box className={className}>
      {/* Search Bar */}
      <SearchBar
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onSubmit={handleSearchSubmit}
        onBarcodeClick={showBarcode ? handleBarcodeClick : null}
        loading={loading}
        placeholder={placeholder}
        autoFocus={mode === 'dialog'}
      />

      {/* AI Results Indicator with Add All option */}
      {hasAIResults && !loading && (
        <Alert
          severity="info"
          icon={<AIIcon />}
          sx={{
            mb: 2,
            borderRadius: '12px',
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            '& .MuiAlert-icon': { color: 'primary.main' }
          }}
          action={
            searchResults.filter(f => f.source === 'ai').length > 1 && (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  // Add all AI-parsed items at once
                  const aiItems = searchResults.filter(f => f.source === 'ai');
                  aiItems.forEach(food => {
                    onFoodSelect?.({
                      ...food,
                      servings: food.serving?.size || 1,
                      mealType: defaultMealType
                    });
                  });
                }}
                sx={{
                  fontWeight: 600,
                  color: 'primary.main',
                  '&:hover': { backgroundColor: 'action.hover' }
                }}
              >
                Add All ({searchResults.filter(f => f.source === 'ai').length})
              </Button>
            )
          }
        >
          AI parsed your description. Click "Add All" to add everything, or select items individually.
        </Alert>
      )}

      {/* Error Message */}
      {error && (
        <Alert
          severity="error"
          onClose={() => setError(null)}
          sx={{
            mb: 3,
            borderRadius: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)'
          }}
        >
          {error}
        </Alert>
      )}

      {/* Search Results */}
      {searchQuery.length >= 2 && (
        <Box sx={{ mb: 3 }}>
          {loading ? (
            renderLoadingSkeletons()
          ) : searchResults.length > 0 ? (
            isCompositeResult(searchResults) ? (
              renderCompositeResults(searchResults)
            ) : (
              (() => {
                const mealResults = searchResults.filter((result) => result.type === 'meal');
                const foodResults = searchResults.filter((result) => result.type !== 'meal');

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
                    {mealResults.length > 0 && renderFoodGrid(mealResults, 'Saved Meals')}
                    {bestMatches.length > 0 && renderFoodGrid(bestMatches, 'Best Matches')}
                    {moreMatches.length > 0 && (
                      <Box sx={{ mb: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                          <Typography
                            variant="h6"
                            sx={{ fontWeight: 600, color: 'text.primary', fontSize: '1.125rem' }}
                          >
                            More Results
                          </Typography>
                          <Button
                            size="small"
                            onClick={() => setShowMoreResults((prev) => !prev)}
                            endIcon={showMoreResults ? <CollapseIcon /> : <ExpandIcon />}
                            sx={{ textTransform: 'none', fontWeight: 600 }}
                          >
                            {showMoreResults ? 'Hide' : `Show ${moreMatches.length}`}
                          </Button>
                        </Box>
                        <Collapse in={showMoreResults}>
                          {renderFoodGrid(moreMatches, '', false)}
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
                borderRadius: '16px',
                backgroundColor: 'background.default',
                border: '1px dashed',
                borderColor: 'divider'
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: 'text.secondary',
                  mb: 1,
                  fontWeight: 600
                }}
              >
                No foods found
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary'
                }}
              >
                Try a different search term or scan a barcode
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Recent Foods */}
      {showRecent && recentFoods.length > 0 && searchQuery.length < 2 && (
        <Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 2
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                color: 'text.primary',
                fontSize: '1.125rem'
              }}
            >
              Recent Foods
            </Typography>
            <Button
              onClick={() => setShowRecentSection(!showRecentSection)}
              endIcon={showRecentSection ? <CollapseIcon /> : <ExpandIcon />}
              sx={{
                color: 'text.secondary',
                textTransform: 'none',
                fontWeight: 600,
                '&:hover': {
                  backgroundColor: 'action.hover',
                  color: 'primary.main'
                }
              }}
            >
              {showRecentSection ? 'Hide' : 'Show'}
            </Button>
          </Box>

          <Collapse in={showRecentSection}>
            {renderFoodGrid(recentFoods, '', false)}
          </Collapse>
        </Box>
      )}

      {/* Empty State (no search, no recent) */}
      {searchQuery.length < 2 && recentFoods.length === 0 && !loading && (
        <Box
          sx={{
            textAlign: 'center',
            py: 8,
            px: 3
          }}
        >
          <Typography
            variant="h5"
            sx={{
              color: 'text.primary',
              mb: 1,
              fontWeight: 700
            }}
          >
            Search for foods
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: 'text.secondary',
              mb: 3
            }}
          >
            Start typing to find foods, or use the barcode scanner
          </Typography>
        </Box>
      )}

      {/* Add Food Modal */}
      <AddFoodModal
        open={!!selectedFood}
        onClose={() => setSelectedFood(null)}
        food={selectedFood}
        onAdd={handleModalAdd}
        defaultMealType={defaultMealType}
      />
    </Box>
  );
};

export default UnifiedFoodSearch;
