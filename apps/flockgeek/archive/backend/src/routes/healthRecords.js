import express from 'express';
import HealthRecord from '../models/HealthRecord.js';
import Bird from '../models/Bird.js';

const router = express.Router();

// GET /health-records - List health records with optional filters
router.get('/', async (req, res) => {
  try {
    const { birdId, type, limit = 50, offset = 0 } = req.query;
    const filter = { ownerId: req.ownerId, deletedAt: { $exists: false } };

    if (birdId) filter.birdId = birdId;
    if (type) filter.type = type;

    const records = await HealthRecord.find(filter)
      .populate('birdId', 'tagId name')
      .sort({ eventDate: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await HealthRecord.countDocuments(filter);

    res.json({
      success: true,
      data: {
        items: records,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Error listing health records:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to list health records' }
    });
  }
});

// GET /health-records/:id - Get specific health record
router.get('/:id', async (req, res) => {
  try {
    const record = await HealthRecord.findOne({
      _id: req.params.id,
      ownerId: req.ownerId,
      deletedAt: { $exists: false }
    }).populate('birdId', 'tagId name');

    if (!record) {
      return res.status(404).json({
        success: false,
        error: { message: 'Health record not found' }
      });
    }

    res.json({
      success: true,
      data: { record }
    });
  } catch (error) {
    console.error('Error getting health record:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get health record' }
    });
  }
});

// POST /health-records - Create new health record
router.post('/', async (req, res) => {
  try {
    const { birdId, eventDate, type, diagnosis, treatment, outcome, cullReason, vet, costCents, notes } = req.body;

    // Validate required fields
    if (!birdId || !eventDate || !type) {
      return res.status(400).json({
        success: false,
        error: { message: 'birdId, eventDate, and type are required' }
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

    const record = new HealthRecord({
      ownerId: req.ownerId,
      birdId,
      eventDate: new Date(eventDate),
      type,
      diagnosis,
      treatment,
      outcome,
      cullReason,
      vet,
      costCents: costCents ? parseInt(costCents) : undefined,
      notes
    });

    await record.save();
    await record.populate('birdId', 'tagId name');

    res.status(201).json({
      success: true,
      data: { record }
    });
  } catch (error) {
    console.error('Error creating health record:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to create health record' }
    });
  }
});

// PATCH /health-records/:id - Update health record
router.patch('/:id', async (req, res) => {
  try {
    const { eventDate, type, diagnosis, treatment, outcome, cullReason, vet, costCents, notes } = req.body;

    const record = await HealthRecord.findOne({
      _id: req.params.id,
      ownerId: req.ownerId,
      deletedAt: { $exists: false }
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        error: { message: 'Health record not found' }
      });
    }

    // Update fields
    if (eventDate !== undefined) record.eventDate = new Date(eventDate);
    if (type !== undefined) record.type = type;
    if (diagnosis !== undefined) record.diagnosis = diagnosis;
    if (treatment !== undefined) record.treatment = treatment;
    if (outcome !== undefined) record.outcome = outcome;
    if (cullReason !== undefined) record.cullReason = cullReason;
    if (vet !== undefined) record.vet = vet;
    if (costCents !== undefined) record.costCents = costCents ? parseInt(costCents) : null;
    if (notes !== undefined) record.notes = notes;

    await record.save();
    await record.populate('birdId', 'tagId name');

    res.json({
      success: true,
      data: { record }
    });
  } catch (error) {
    console.error('Error updating health record:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to update health record' }
    });
  }
});

// DELETE /health-records/:id - Soft delete health record
router.delete('/:id', async (req, res) => {
  try {
    const record = await HealthRecord.findOne({
      _id: req.params.id,
      ownerId: req.ownerId,
      deletedAt: { $exists: false }
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        error: { message: 'Health record not found' }
      });
    }

    record.deletedAt = new Date();
    await record.save();

    res.json({
      success: true,
      data: { message: 'Health record deleted successfully' }
    });
  } catch (error) {
    console.error('Error deleting health record:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete health record' }
    });
  }
});

export default router;