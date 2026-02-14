import HatchEvent from "../models/HatchEvent.js";
import Bird from "../models/Bird.js";
import Group from "../models/Group.js";
import GroupMembership from "../models/GroupMembership.js";
import Pairing from "../models/Pairing.js";
import MeatRun from "../models/MeatRun.js";

/**
 * Get the next available tag ID starting from 2000
 * Finds the highest tagId >= 2000 and returns the next one
 */
const getNextTempTagId = async (ownerId, count = 1) => {
  const TEMP_ID_START = 2000;

  // Find all birds with numeric tagIds >= 2000
  const birds = await Bird.find({
    ownerId,
    deletedAt: { $exists: false }
  }).select("tagId").lean();

  // Find the highest numeric tagId >= 2000
  let maxId = TEMP_ID_START - 1;
  for (const bird of birds) {
    const numId = parseInt(bird.tagId, 10);
    if (!isNaN(numId) && numId >= TEMP_ID_START && numId > maxId) {
      maxId = numId;
    }
  }

  // Return array of next available IDs
  const ids = [];
  for (let i = 1; i <= count; i++) {
    ids.push(String(maxId + i));
  }
  return ids;
};

export const createHatchEvent = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { pairingId, purpose, setDate, hatchDate, eggsSet, eggsFertile, chicksHatched, pullets, cockerels, notes } = req.body;

    if (!pairingId || !setDate || !eggsSet) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "pairingId, setDate and eggsSet required" }
      });
    }

    // Verify the pairing exists
    const pairing = await Pairing.findById(pairingId);
    if (!pairing) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "Pairing not found" }
      });
    }

    const event = await HatchEvent.create({
      ownerId,
      pairingId,
      purpose: purpose || "layer",
      setDate,
      hatchDate,
      eggsSet,
      eggsFertile,
      chicksHatched,
      pullets,
      cockerels,
      notes
    });

    res.status(201).json({ data: { hatchEvent: event } });
  } catch (err) {
    next(err);
  }
};

export const listHatchEvents = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { pairingId, page = 1, limit = 20, sortBy = "setDate", sortOrder = "desc" } = req.query;

    const filter = { ownerId, deletedAt: { $exists: false } };
    if (pairingId) filter.pairingId = pairingId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const items = await HatchEvent.find(filter)
      .populate("pairingId", "name")
      .skip(skip)
      .limit(parseInt(limit))
      .sort(sort);

    const total = await HatchEvent.countDocuments(filter);

    res.json({
      data: {
        hatchEvents: items,
        pagination: { total, page: parseInt(page), limit: parseInt(limit) }
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getHatchEvent = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const event = await HatchEvent.findOne({
      _id: id,
      ownerId,
      deletedAt: { $exists: false }
    }).populate("pairingId", "name roosterIds henIds");

    if (!event) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Hatch event not found" }
      });
    }

    res.json({ data: { hatchEvent: event } });
  } catch (err) {
    next(err);
  }
};

export const updateHatchEvent = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;
    const data = req.body;

    const event = await HatchEvent.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { ...data, updatedAt: new Date() },
      { new: true }
    );

    if (!event) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Hatch event not found" }
      });
    }

    res.json({ data: { hatchEvent: event } });
  } catch (err) {
    next(err);
  }
};

export const deleteHatchEvent = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const event = await HatchEvent.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { deletedAt: new Date(), updatedAt: new Date() },
      { new: true }
    );

    if (!event) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Hatch event not found" }
      });
    }

    res.json({ data: { hatchEvent: event } });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/hatch-events/:id/register-chicks
 * Register chicks from a hatch event
 *
 * For LAYER purpose:
 *   - Auto-creates birds with temp IDs (2000+) and "New Chick" names
 *   - Creates a brood (Group) and links all chicks
 *   Body: { count: number, broodName?: string }
 *
 * For MEAT purpose:
 *   - Creates a MeatRun record to track aggregate stats
 *   - No individual birds created
 *   Body: { count: number, meatRunName?: string }
 */
export const registerChicks = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;
    const { count, broodName, meatRunName } = req.body;

    if (!count || count < 1) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "count required (number of chicks)" }
      });
    }

    // Get the hatch event
    const hatchEvent = await HatchEvent.findOne({
      _id: id,
      ownerId,
      deletedAt: { $exists: false }
    });

    if (!hatchEvent) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Hatch event not found" }
      });
    }

    if (!hatchEvent.pairingId) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "Hatch event must have a pairing to register chicks" }
      });
    }

    // Get the pairing for naming
    const pairing = await Pairing.findById(hatchEvent.pairingId);
    if (!pairing) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "Associated pairing not found" }
      });
    }

    const hatchDateStr = hatchEvent.hatchDate
      ? hatchEvent.hatchDate.toISOString().split("T")[0]
      : hatchEvent.setDate.toISOString().split("T")[0];

    // Handle based on purpose
    if (hatchEvent.purpose === "meat") {
      // MEAT RUN: Create aggregate tracking record, no individual birds
      const meatRun = await MeatRun.create({
        ownerId,
        pairingId: hatchEvent.pairingId,
        hatchEventId: hatchEvent._id,
        name: meatRunName || `Meat Run from ${pairing.name} - ${hatchDateStr}`,
        startDate: hatchEvent.hatchDate || hatchEvent.setDate,
        startCount: count,
        status: "growing"
      });

      // Update hatch event with meat run reference
      hatchEvent.meatRunId = meatRun._id;
      hatchEvent.chicksHatched = count;
      await hatchEvent.save();

      return res.status(201).json({
        data: {
          meatRun,
          hatchEvent
        }
      });
    }

    // LAYER FLOCK: Create individual birds with temp IDs
    // Get next available temp tag IDs starting from 2000
    const tempTagIds = await getNextTempTagId(ownerId, count);

    // Create the brood group
    const group = await Group.create({
      ownerId,
      name: broodName || `Brood from ${pairing.name} - ${hatchDateStr}`,
      pairingId: hatchEvent.pairingId,
      hatchEventId: hatchEvent._id,
      hatchDate: hatchEvent.hatchDate || hatchEvent.setDate,
      startDate: hatchEvent.hatchDate || hatchEvent.setDate,
      description: `Chicks hatched from pairing ${pairing.name}`
    });

    // Create birds linked to the pairing
    const createdBirds = [];
    for (let i = 0; i < count; i++) {
      const bird = await Bird.create({
        ownerId,
        tagId: tempTagIds[i],
        name: "New Chick",
        sex: "unknown",
        hatchDate: hatchEvent.hatchDate || hatchEvent.setDate,
        origin: "own_egg",
        pairingId: hatchEvent.pairingId,
        status: "active"
      });
      createdBirds.push(bird);

      // Add to brood group
      await GroupMembership.create({
        ownerId,
        groupId: group._id,
        birdId: bird._id,
        joinedAt: hatchEvent.hatchDate || hatchEvent.setDate
      });
    }

    // Update hatch event with brood group reference
    hatchEvent.broodGroupId = group._id;
    hatchEvent.chicksHatched = count;
    await hatchEvent.save();

    res.status(201).json({
      data: {
        broodGroup: group,
        birds: createdBirds,
        hatchEvent
      }
    });
  } catch (err) {
    next(err);
  }
};
