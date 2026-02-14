import { Router } from "express";
import GroupMembership from "../models/GroupMembership.js";
import { requireOwner } from "../middleware/authMiddleware.js";

const router = Router();

/**
 * GET /api/group-memberships
 * List memberships with optional filters
 * Query params: groupId, birdId, active (true = no leftAt)
 */
router.get("/", requireOwner, async (req, res) => {
  try {
    const { groupId, birdId, active } = req.query;

    const filter = {
      ownerId: req.ownerId,
      deletedAt: null
    };

    if (groupId) filter.groupId = groupId;
    if (birdId) filter.birdId = birdId;
    if (active === "true") filter.leftAt = null;

    const memberships = await GroupMembership.find(filter)
      .populate("birdId", "name tagId species breed sex status")
      .populate("groupId", "name purpose")
      .sort({ joinedAt: -1 })
      .limit(1000);

    res.json({
      success: true,
      data: { memberships },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

/**
 * POST /api/group-memberships
 * Add a bird to a group
 */
router.post("/", requireOwner, async (req, res) => {
  try {
    const { groupId, birdId, role, notes } = req.body;

    if (!groupId || !birdId) {
      return res.status(400).json({
        success: false,
        error: { message: "groupId and birdId are required" }
      });
    }

    // Check if already active member
    const existing = await GroupMembership.findOne({
      ownerId: req.ownerId,
      groupId,
      birdId,
      leftAt: null,
      deletedAt: null
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: { message: "Bird is already an active member of this group" }
      });
    }

    const membership = await GroupMembership.create({
      ownerId: req.ownerId,
      groupId,
      birdId,
      joinedAt: new Date(),
      role,
      notes
    });

    res.status(201).json({
      success: true,
      data: { membership },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

/**
 * DELETE /api/group-memberships/:id
 * Remove bird from group (set leftAt)
 */
router.delete("/:id", requireOwner, async (req, res) => {
  try {
    const membership = await GroupMembership.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.ownerId, leftAt: null },
      { leftAt: new Date() },
      { new: true }
    );

    if (!membership) {
      return res.status(404).json({
        success: false,
        error: { message: "Active membership not found" }
      });
    }

    res.json({
      success: true,
      data: { membership },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

export default router;
