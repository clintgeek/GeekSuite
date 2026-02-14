import express from 'express';
import GroupMembership from '../models/GroupMembership.js';
import Bird from '../models/Bird.js';
import Group from '../models/Group.js';

const router = express.Router();

// Add bird to group
router.post('/', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { groupId, birdId, joinedDate, notes } = req.body;

    if (!ownerId || !groupId || !birdId) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'ownerId, groupId, and birdId required' }
      });
    }

    // Verify bird and group exist and belong to owner
    const [bird, group] = await Promise.all([
      Bird.findOne({ _id: birdId, ownerId }),
      Group.findOne({ _id: groupId, ownerId })
    ]);

    if (!bird) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Bird not found' }
      });
    }

    if (!group) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Group not found' }
      });
    }

    // Check if bird is already in this group (active membership)
    const existing = await GroupMembership.findOne({
      ownerId,
      groupId,
      birdId,
      leftDate: { $exists: false }
    });

    if (existing) {
      return res.status(400).json({
        error: { code: 'ALREADY_EXISTS', message: 'Bird is already in this group' }
      });
    }

    const membership = await GroupMembership.create({
      ownerId,
      groupId,
      birdId,
      joinedDate: joinedDate || new Date(),
      notes
    });

    res.json({ data: { membership } });
  } catch (err) {
    next(err);
  }
});

// Remove bird from group
router.delete('/:id', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const membership = await GroupMembership.findOneAndUpdate(
      { _id: req.params.id, ownerId, leftDate: { $exists: false } },
      { leftDate: new Date() },
      { new: true }
    );

    if (!membership) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Active membership not found' }
      });
    }

    res.json({ data: { ok: true, membership } });
  } catch (err) {
    next(err);
  }
});

// Get birds in a group
router.get('/group/:groupId', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { groupId } = req.params;
    const { includeLeft } = req.query;

    if (!ownerId) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'ownerId required' }
      });
    }

    const filter = { ownerId, groupId };
    if (!includeLeft) {
      filter.leftDate = { $exists: false };
    }

    const memberships = await GroupMembership.find(filter)
      .populate('birdId')
      .sort({ joinedDate: -1 });

    res.json({ data: { items: memberships } });
  } catch (err) {
    next(err);
  }
});

// Get groups for a bird
router.get('/bird/:birdId', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { birdId } = req.params;
    const { includeLeft } = req.query;

    if (!ownerId) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'ownerId required' }
      });
    }

    const filter = { ownerId, birdId };
    if (!includeLeft) {
      filter.leftDate = { $exists: false };
    }

    const memberships = await GroupMembership.find(filter)
      .populate('groupId')
      .sort({ joinedDate: -1 });

    res.json({ data: { items: memberships } });
  } catch (err) {
    next(err);
  }
});

export default router;