import express from 'express';
import BirdTrait from '../models/BirdTrait.js';
import Bird from '../models/Bird.js';

const router = express.Router();

// GET /bird-traits - List bird traits with optional filters
router.get('/', async (req, res) => {
  try {
    const { birdId, limit = 50, offset = 0 } = req.query;
    const filter = { ownerId: req.ownerId, deletedAt: { $exists: false } };

    if (birdId) filter.birdId = birdId;

    const traits = await BirdTrait.find(filter)
      .populate('birdId', 'tagId name')
      .sort({ loggedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await BirdTrait.countDocuments(filter);

    res.json({
      success: true,
      data: {
        items: traits,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Error listing bird traits:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to list bird traits' }
    });
  }
});

// GET /bird-traits/:id - Get specific bird trait
router.get('/:id', async (req, res) => {
  try {
    const trait = await BirdTrait.findOne({
      _id: req.params.id,
      ownerId: req.ownerId,
      deletedAt: { $exists: false }
    }).populate('birdId', 'tagId name');

    if (!trait) {
      return res.status(404).json({
        success: false,
        error: { message: 'Bird trait not found' }
      });
    }

    res.json({
      success: true,
      data: { trait }
    });
  } catch (error) {
    console.error('Error getting bird trait:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get bird trait' }
    });
  }
});

// POST /bird-traits - Create new bird trait
router.post('/', async (req, res) => {
  try {
    const { birdId, loggedAt, weightGrams, featherColor, pattern, combType, legColor, notes } = req.body;

    // Validate required fields
    if (!birdId || !loggedAt) {
      return res.status(400).json({
        success: false,
        error: { message: 'birdId and loggedAt are required' }
      });
    }

    // Verify bird exists and belongs to owner
    const bird = await Bird.findOne({ _id: birdId, ownerId: req.ownerId });
    if (!bird) {
      return res.status(404).json({
        success: false,
        error: { message: 'Bird not found' }
      });
    }

    const trait = new BirdTrait({
      ownerId: req.ownerId,
      birdId,
      loggedAt: new Date(loggedAt),
      weightGrams: weightGrams ? parseInt(weightGrams) : undefined,
      featherColor,
      pattern,
      combType,
      legColor,
      notes
    });

    await trait.save();
    await trait.populate('birdId', 'tagId name');

    res.status(201).json({
      success: true,
      data: { trait }
    });
  } catch (error) {
    console.error('Error creating bird trait:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to create bird trait' }
    });
  }
});

// PATCH /bird-traits/:id - Update bird trait
router.patch('/:id', async (req, res) => {
  try {
    const { loggedAt, weightGrams, featherColor, pattern, combType, legColor, notes } = req.body;

    const trait = await BirdTrait.findOne({
      _id: req.params.id,
      ownerId: req.ownerId,
      deletedAt: { $exists: false }
    });

    if (!trait) {
      return res.status(404).json({
        success: false,
        error: { message: 'Bird trait not found' }
      });
    }

    // Update fields
    if (loggedAt !== undefined) trait.loggedAt = new Date(loggedAt);
    if (weightGrams !== undefined) trait.weightGrams = weightGrams ? parseInt(weightGrams) : null;
    if (featherColor !== undefined) trait.featherColor = featherColor;
    if (pattern !== undefined) trait.pattern = pattern;
    if (combType !== undefined) trait.combType = combType;
    if (legColor !== undefined) trait.legColor = legColor;
    if (notes !== undefined) trait.notes = notes;

    await trait.save();
    await trait.populate('birdId', 'tagId name');

    res.json({
      success: true,
      data: { trait }
    });
  } catch (error) {
    console.error('Error updating bird trait:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to update bird trait' }
    });
  }
});

// DELETE /bird-traits/:id - Soft delete bird trait
router.delete('/:id', async (req, res) => {
  try {
    const trait = await BirdTrait.findOne({
      _id: req.params.id,
      ownerId: req.ownerId,
      deletedAt: { $exists: false }
    });

    if (!trait) {
      return res.status(404).json({
        success: false,
        error: { message: 'Bird trait not found' }
      });
    }

    trait.deletedAt = new Date();
    await trait.save();

    res.json({
      success: true,
      data: { message: 'Bird trait deleted successfully' }
    });
  } catch (error) {
    console.error('Error deleting bird trait:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete bird trait' }
    });
  }
});

// GET /bird-traits/weight-history/:birdId - Get weight history for charts
router.get('/weight-history/:birdId', async (req, res) => {
  try {
    const { birdId } = req.params;
    const { days = 365 } = req.query;

    // Verify bird exists and belongs to owner
    const bird = await Bird.findOne({ _id: birdId, ownerId: req.ownerId });
    if (!bird) {
      return res.status(404).json({
        success: false,
        error: { message: 'Bird not found' }
      });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

    const weightHistory = await BirdTrait.find({
      ownerId: req.ownerId,
      birdId,
      weightGrams: { $exists: true, $ne: null },
      loggedAt: { $gte: cutoffDate },
      deletedAt: { $exists: false }
    })
    .select('loggedAt weightGrams')
    .sort({ loggedAt: 1 });

    res.json({
      success: true,
      data: {
        birdId,
        weightHistory: weightHistory.map(w => ({
          date: w.loggedAt,
          weightGrams: w.weightGrams
        }))
      }
    });
  } catch (error) {
    console.error('Error getting weight history:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get weight history' }
    });
  }
});

export default router;