import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  Alert,
  Collapse,
  Button,
  Skeleton
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
import CompositeResolver from './CompositeResolver';
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

/**
 * Stable key for an AI composite group. Tied to the parsed phrase + quantity
 * + the original index, so two distinct groups with the same phrase can coexist.
 */
const groupKeyOf = (group) => {
  const idx = group?.foods?.[0]?.compositeIndex ?? '';
  return `${group?.item || ''}__${group?.quantity ?? ''}__${group?.unit ?? ''}__${idx}`;
};

/**
 * Decide a sensible default serving count for a food we're staging.
 * Mirrors the heuristic from stageFood so auto-stage and manual stage agree.
 */
const computeDefaultServings = (food) => {
  if (food?.requestedQuantity && Number(food.requestedQuantity) > 0) {
    return Number(food.requestedQuantity);
  }
  const size = Number(food?.serving?.size);
  if (size > 0 && size <= 10) return size;
  return 1;
};

/**
 * Backend marks AI-parsed composite items with `compositeItem`. If any result
 * carries that field, the whole result set is treated as composite.
 */
const isCompositeResult = (foods) =>
  foods && foods.length > 0 && foods.some((food) => Boolean(food.compositeItem));

/**
 * Group composite results by parsed item, preserving order. Backend already
 * sorts by `compositeIndex` then by relevance, so foods[0] of each group is
 * the best match for that parsed phrase.
 */
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
  className,

  // Keto
  ketoMode = false,
  netCarbLimit = 20,
}) => {
  const theme = useTheme();
  const ink = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const primary = theme.palette.primary.main;

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [recentFoods, setRecentFoods] = useState([]);
  const [myMeals, setMyMeals] = useState([]);
  const [myFoods, setMyFoods] = useState([]);
  const [showMyMealsSection, setShowMyMealsSection] = useState(true);
  const [showMyFoodsSection, setShowMyFoodsSection] = useState(true);
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

  // ─── Composite resolver state ───
  // Groups the user explicitly skipped (so the auto-stage pass leaves them alone).
  const [skippedGroupKeys, setSkippedGroupKeys] = useState(() => new Set());
  // Tracks which composite query has already had its best matches auto-staged,
  // so we run the pre-fill exactly once per search.
  const autoStagedQueryRef = useRef(null);

  // Tray identity index → used to badge cards and count duplicates
  const trayIndex = useMemo(() => {
    const map = new Map();
    for (const item of trayItems) {
      const key = item.identityKey;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [trayItems]);

  // ─── Derived: composite groups for the resolver ───
  // Pure derivation off searchResults — feeds both the resolver render and
  // the auto-stage effect below.
  const compositeGroups = useMemo(
    () => (isCompositeResult(searchResults) ? groupCompositeResults(searchResults) : []),
    [searchResults]
  );

  // Auto-clear results when query emptied
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setHasAIResults(false);
      // Reset composite memory so a fresh search re-auto-stages
      autoStagedQueryRef.current = null;
      setSkippedGroupKeys(new Set());
    }
  }, [searchQuery]);

  // ─── Auto-stage best matches on composite arrival ───
  // Runs once per unique composite query. The user lands on the resolver
  // already pre-resolved — happy path is zero taps to log a parsed meal.
  useEffect(() => {
    if (compositeGroups.length === 0) return;
    if (autoStagedQueryRef.current === searchQuery) return;

    autoStagedQueryRef.current = searchQuery;
    setSkippedGroupKeys(new Set());

    setTrayItems((prev) => {
      // Skip any group that already has a representative in the tray (rare,
      // but guards against double-staging if the user re-runs the same query)
      const existingIdentities = new Set(prev.map((it) => it.identityKey));
      const additions = [];
      for (const group of compositeGroups) {
        if (!group.foods?.length) continue;
        const groupIdentities = group.foods.map((f) => getFoodIdentity(f));
        if (groupIdentities.some((k) => existingIdentities.has(k))) continue;
        const best = group.foods[0];
        additions.push({
          stageId: nextStageId(),
          identityKey: getFoodIdentity(best),
          ...best,
          servings: computeDefaultServings(best)
        });
      }
      return additions.length > 0 ? [...prev, ...additions] : prev;
    });
  }, [compositeGroups, searchQuery]);

  // Load recent foods + My Meals + My Foods
  useEffect(() => {
    if (showRecent) loadRecentFoods();
    loadMyMeals();
    loadMyFoods();
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

  const loadMyMeals = async () => {
    try {
      const meals = await fitnessGeekService.getMeals();
      const arr = Array.isArray(meals) ? meals : (meals?.data || []);
      const mapped = arr.map((m) => {
        const totalCals = (m.food_items || []).reduce((sum, it) => {
          const f = it.food_item_id || it.food_item || {};
          return sum + (f?.nutrition?.calories_per_serving || 0) * (it.servings || 1);
        }, 0);
        return {
          _id: m._id || m.id,   // GQL serializes as 'id'; REST returns '_id'
          name: m.name,
          source: 'meal',
          type: 'meal',
          nutrition: { calories_per_serving: Math.round(totalCals) }
        };
      });
      setMyMeals(mapped);
    } catch (err) {
      console.error('Failed to load my meals:', err);
    }
  };

  const loadMyFoods = async () => {
    try {
      const foods = await foodService.getCustomFoods(50);
      setMyFoods(Array.isArray(foods) ? foods : []);
    } catch (err) {
      console.error('Failed to load my foods:', err);
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
          _id: m._id || m.id,   // GQL serializes as 'id'; REST returns '_id'
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

    setTrayItems((prev) => [
      ...prev,
      {
        stageId: nextStageId(),
        identityKey: getFoodIdentity(food),
        ...food,
        servings: computeDefaultServings(food)
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

  const clearTray = () => {
    setTrayItems([]);
    setSkippedGroupKeys(new Set());
    autoStagedQueryRef.current = null;
  };

  // ─── Composite resolver ops ──────────────────────────────────────────
  // The resolver maintains a hard invariant: each group has either exactly
  // one staged candidate, OR is explicitly marked as skipped. Selection swaps
  // are atomic — never zero, never two.

  const stageBestForGroup = useCallback((group, prevTray) => {
    if (!group?.foods?.length) return prevTray;
    const best = group.foods[0];
    return [
      ...prevTray,
      {
        stageId: nextStageId(),
        identityKey: getFoodIdentity(best),
        ...best,
        servings: computeDefaultServings(best)
      }
    ];
  }, []);

  const selectCandidateForGroup = useCallback((group, newFood) => {
    const groupIdentityKeys = new Set(group.foods.map((f) => getFoodIdentity(f)));
    const newIdentity = getFoodIdentity(newFood);
    setTrayItems((prev) => {
      // Strip every existing entry from this group, then add the new one
      const filtered = prev.filter((it) => !groupIdentityKeys.has(it.identityKey));
      return [
        ...filtered,
        {
          stageId: nextStageId(),
          identityKey: newIdentity,
          ...newFood,
          servings: computeDefaultServings(newFood)
        }
      ];
    });
    // Selecting always un-skips the group
    const key = groupKeyOf(group);
    setSkippedGroupKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const skipGroup = useCallback((group) => {
    const key = groupKeyOf(group);
    const groupIdentityKeys = new Set(group.foods.map((f) => getFoodIdentity(f)));
    setTrayItems((prev) => prev.filter((it) => !groupIdentityKeys.has(it.identityKey)));
    setSkippedGroupKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const restoreGroup = useCallback((group) => {
    const key = groupKeyOf(group);
    setSkippedGroupKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setTrayItems((prev) => stageBestForGroup(group, prev));
  }, [stageBestForGroup]);

  const resetCompositeSelections = useCallback((groups) => {
    if (!groups || groups.length === 0) return;
    setSkippedGroupKeys(new Set());
    setTrayItems((prev) => {
      // Strip everything tied to this composite query, then re-add best matches
      const allCompositeIdentityKeys = new Set(
        groups.flatMap((g) => g.foods.map((f) => getFoodIdentity(f)))
      );
      const filtered = prev.filter((it) => !allCompositeIdentityKeys.has(it.identityKey));
      const additions = groups.flatMap((group) => {
        if (!group?.foods?.length) return [];
        const best = group.foods[0];
        return [
          {
            stageId: nextStageId(),
            identityKey: getFoodIdentity(best),
            ...best,
            servings: computeDefaultServings(best)
          }
        ];
      });
      return [...filtered, ...additions];
    });
  }, []);

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
          ketoMode={ketoMode}
        />
      </Grid>
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

      {/* AI indicator — suppressed when the composite resolver is showing,
          since the resolver carries its own helper line. */}
      {hasAIResults && !loading && compositeGroups.length === 0 && (
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
            compositeGroups.length > 0 ? (
              <CompositeResolver
                groups={compositeGroups}
                trayItems={trayItems}
                skippedGroupKeys={skippedGroupKeys}
                onSelectCandidate={selectCandidateForGroup}
                onSkipGroup={skipGroup}
                onRestoreGroup={restoreGroup}
                onResetAll={() => resetCompositeSelections(compositeGroups)}
                groupKeyOf={groupKeyOf}
                getFoodIdentity={getFoodIdentity}
              />
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

      {/* My Meals — pre-search browse */}
      {myMeals.length > 0 && searchQuery.length < 2 && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography component="h3" sx={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.125rem', fontWeight: 400, color: ink, letterSpacing: '-0.01em' }}>
              My Meals
            </Typography>
            <Button
              onClick={() => setShowMyMealsSection(!showMyMealsSection)}
              endIcon={showMyMealsSection ? <CollapseIcon /> : <ExpandIcon />}
              sx={{ color: muted, textTransform: 'uppercase', fontWeight: 700, fontSize: '0.6875rem', letterSpacing: '0.12em' }}
            >
              {showMyMealsSection ? 'Hide' : 'Show'}
            </Button>
          </Box>
          <Collapse in={showMyMealsSection}>{renderFoodGrid(myMeals, '', false, 0)}</Collapse>
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

      {/* My Foods (custom) — pre-search browse */}
      {myFoods.length > 0 && searchQuery.length < 2 && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography component="h3" sx={{ fontFamily: "'DM Serif Display', serif", fontSize: '1.125rem', fontWeight: 400, color: ink, letterSpacing: '-0.01em' }}>
              My Foods
            </Typography>
            <Button
              onClick={() => setShowMyFoodsSection(!showMyFoodsSection)}
              endIcon={showMyFoodsSection ? <CollapseIcon /> : <ExpandIcon />}
              sx={{ color: muted, textTransform: 'uppercase', fontWeight: 700, fontSize: '0.6875rem', letterSpacing: '0.12em' }}
            >
              {showMyFoodsSection ? 'Hide' : 'Show'}
            </Button>
          </Box>
          <Collapse in={showMyFoodsSection}>{renderFoodGrid(myFoods, '', false, 0)}</Collapse>
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
        ketoMode={ketoMode}
        netCarbLimit={netCarbLimit}
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
