import Group from "../models/Group.js";
import GroupMembership from "../models/GroupMembership.js";
import { logger } from "../utils/logger.js";

/**
 * POST /api/groups
 * Create a new group
 */
export const createGroup = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { name, purpose, type, startDate, description, notes } = req.body;

    if (!name) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "name required" }
      });
    }

    const group = await Group.create({
      ownerId,
      name,
      purpose,
      type,
      startDate: startDate || new Date(),
      description,
      notes
    });

    res.status(201).json({ data: { group } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/groups
 * List groups
 */
export const listGroups = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { purpose, page = 1, limit = 20, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    const filter = { ownerId, deletedAt: { $exists: false } };
    if (purpose) filter.purpose = purpose;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const items = await Group.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort(sortOptions);

    const total = await Group.countDocuments(filter);

    res.json({
      data: {
        groups: items,
        pagination: { total, page: parseInt(page), limit: parseInt(limit) }
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/groups/:id
 * Get a single group with member count
 */
export const getGroup = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const group = await Group.findOne({
      _id: id,
      ownerId,
      deletedAt: { $exists: false }
    });

    if (!group) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Group not found" }
      });
    }

    // Get active members count
    const memberCount = await GroupMembership.countDocuments({
      ownerId,
      groupId: id,
      leftAt: { $exists: false },
      deletedAt: { $exists: false }
    });

    res.json({ data: { group, memberCount } });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/groups/:id
 * Update a group
 */
export const updateGroup = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;
    const data = req.body;

    const group = await Group.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { ...data, updatedAt: new Date() },
      { new: true }
    );

    if (!group) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Group not found" }
      });
    }

    res.json({ data: { group } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/groups/bird/:birdId
 * Get groups for a specific bird
 */
export const getBirdGroups = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { birdId } = req.params;

    const memberships = await GroupMembership.find({
      ownerId,
      birdId,
      leftAt: { $exists: false },
      deletedAt: { $exists: false }
    })
    .populate('groupId', 'name purpose type')
    .sort({ joinedAt: -1 });

    const groups = memberships.map(membership => ({
      ...membership.groupId.toObject(),
      membership: {
        joinedAt: membership.joinedAt,
        role: membership.role,
        notes: membership.notes
      }
    }));

    res.json({ data: { groups } });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/groups/:id
 * Soft delete a group
 */
export const deleteGroup = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const group = await Group.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { deletedAt: new Date(), updatedAt: new Date() },
      { new: true }
    );

    if (!group) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Group not found" }
      });
    }

    res.json({ data: { group } });
  } catch (err) {
    next(err);
  }
};
