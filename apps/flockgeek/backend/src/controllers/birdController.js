import Bird from "../models/Bird.js";
import Pairing from "../models/Pairing.js";
import GroupMembership from "../models/GroupMembership.js";
import Group from "../models/Group.js";
import { logger } from "../utils/logger.js";

const normalizeNullableRefs = (data) => {
  if (!data || typeof data !== "object") return;
  ["pairingId", "locationId"].forEach((field) => {
    if (
      Object.prototype.hasOwnProperty.call(data, field) &&
      (data[field] === "" || data[field] === null)
    ) {
      data[field] = null;
    }
  });
};

/**
 * POST /api/birds
 * Create a new bird
 */
export const createBird = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const data = req.body || {};

    normalizeNullableRefs(data);

    // Validate required fields
    if (!data.tagId) {
      return res.status(400).json({
        error: {
          code: "BAD_REQUEST",
          message: "tagId required"
        }
      });
    }

    // Check for duplicate tagId
    const existing = await Bird.findOne({ ownerId, tagId: data.tagId });
    if (existing) {
      return res.status(400).json({
        error: {
          code: "DUPLICATE",
          message: `Tag ID '${data.tagId}' already exists for this owner`
        }
      });
    }

    const bird = await Bird.create({ ownerId, ...data });
    res.status(201).json({ data: { bird } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/birds
 * List birds with filtering and pagination
 */
export const listBirds = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { status, sex, breed, locationId, q, page = 1, limit = 20, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    const filter = { ownerId, deletedAt: { $exists: false } };

    if (status) filter.status = status;
    if (sex) filter.sex = sex;
    if (breed) filter.breed = breed;
    if (locationId) filter.locationId = locationId;
    if (q) {
      filter.$or = [
        { name: new RegExp(q, "i") },
        { tagId: new RegExp(q, "i") }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let items;
    if (sortBy === "tagId") {
      // Use aggregation pipeline for numeric sorting of tagId
      const sortDirection = sortOrder === "desc" ? -1 : 1;
      const pipeline = [
        { $match: filter },
        {
          $addFields: {
            tagIdNumeric: {
              $convert: {
                input: "$tagId",
                to: "double",
                onError: "$tagId", // fallback to string if conversion fails
                onNull: "$tagId"
              }
            }
          }
        },
        { $sort: { tagIdNumeric: sortDirection } },
        { $skip: skip },
        { $limit: parseInt(limit) },
        {
          $lookup: {
            from: "locations",
            localField: "locationId",
            foreignField: "_id",
            as: "locationId"
          }
        },
        {
          $unwind: {
            path: "$locationId",
            preserveNullAndEmptyArrays: true
          }
        }
      ];

      items = await Bird.aggregate(pipeline);
    } else {
      // Standard sorting for other fields
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

      items = await Bird.find(filter)
        .populate("locationId", "name")
        .skip(skip)
        .limit(parseInt(limit))
        .sort(sortOptions);
    }

    const total = await Bird.countDocuments(filter);

    res.json({
      data: { birds: items, pagination: { total, page: parseInt(page), limit: parseInt(limit) } }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/birds/:id
 * Get a single bird by ID
 */
export const getBird = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const bird = await Bird.findOne({
      _id: id,
      ownerId,
      deletedAt: { $exists: false }
    })
      .populate("pairingId", "name roosterIds henIds")
      .populate("locationId", "name");

    if (!bird) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Bird not found"
        }
      });
    }

    res.json({ data: { bird } });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/birds/:id
 * Update a bird
 */
export const updateBird = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;
    const data = req.body || {};

    normalizeNullableRefs(data);

    // Check if tagId is being changed and already exists
    if (data.tagId) {
      const existing = await Bird.findOne({
        ownerId,
        tagId: data.tagId,
        _id: { $ne: id }
      });
      if (existing) {
        return res.status(400).json({
          error: {
            code: "DUPLICATE",
            message: `Tag ID '${data.tagId}' already exists for this owner`
          }
        });
      }
    }

    const bird = await Bird.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { ...data, updatedAt: new Date() },
      { new: true }
    );

    if (!bird) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Bird not found"
        }
      });
    }

    res.json({ data: { bird } });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/birds/:id
 * Soft delete a bird
 */
export const deleteBird = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const bird = await Bird.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { deletedAt: new Date(), updatedAt: new Date() },
      { new: true }
    );

    if (!bird) {
      return res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Bird not found"
        }
      });
    }

    res.json({ data: { bird } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/birds/breeding-candidates
 * Get breeding candidate recommendations for egg line or meat line
 *
 * Query params:
 *  - line: "egg" | "meat" (required)
 *  - limit: number of candidates to return (default 10)
 *  - breed: filter by breed
 */
export const getBreedingCandidates = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { line, limit = 10, breed } = req.query;

    if (!line || !["egg", "meat"].includes(line)) {
      return res.status(400).json({
        error: {
          code: "BAD_REQUEST",
          message: "line query param required: 'egg' or 'meat'"
        }
      });
    }

    const baseFilter = {
      ownerId,
      deletedAt: { $exists: false },
      status: "active"
    };
    if (breed) baseFilter.breed = breed;

    // Fetch hens and roosters separately
    const hensFilter = { ...baseFilter, sex: { $in: ["hen", "pullet"] } };
    const roostersFilter = { ...baseFilter, sex: { $in: ["rooster", "cockerel"] } };

    const [hens, roosters] = await Promise.all([
      Bird.find(hensFilter).lean(),
      Bird.find(roostersFilter).lean()
    ]);

    let henCandidates, roosterCandidates;

    if (line === "egg") {
      // Egg line: prioritize temperament for roosters, production for hens
      // Since we don't have estimated production on the bird yet, we'll return
      // all hens and let the frontend join with /egg-production/estimates

      // Roosters: sort by temperament (highest first)
      roosterCandidates = roosters
        .filter(r => r.temperamentScore != null)
        .sort((a, b) => b.temperamentScore - a.temperamentScore)
        .slice(0, parseInt(limit));

      // Hens: return all active hens (frontend will join with estimates)
      henCandidates = hens.slice(0, parseInt(limit));

    } else {
      // Meat line: prioritize weight and health

      // Sort by weight (highest first), then by health score
      const sortByWeightAndHealth = (a, b) => {
        // Primary: weight
        const weightA = a.weightGrams || 0;
        const weightB = b.weightGrams || 0;
        if (weightB !== weightA) return weightB - weightA;

        // Secondary: health score
        const healthA = a.healthScore || 0;
        const healthB = b.healthScore || 0;
        return healthB - healthA;
      };

      roosterCandidates = roosters
        .filter(r => r.weightGrams != null)
        .sort(sortByWeightAndHealth)
        .slice(0, parseInt(limit));

      henCandidates = hens
        .filter(h => h.weightGrams != null)
        .sort(sortByWeightAndHealth)
        .slice(0, parseInt(limit));
    }

    res.json({
      data: {
        line,
        hens: henCandidates.map(h => ({
          _id: h._id,
          tagId: h.tagId,
          name: h.name,
          breed: h.breed,
          sex: h.sex,
          weightGrams: h.weightGrams,
          weightDate: h.weightDate,
          temperamentScore: h.temperamentScore,
          healthScore: h.healthScore,
          hatchDate: h.hatchDate
        })),
        roosters: roosterCandidates.map(r => ({
          _id: r._id,
          tagId: r.tagId,
          name: r.name,
          breed: r.breed,
          sex: r.sex,
          weightGrams: r.weightGrams,
          weightDate: r.weightDate,
          temperamentScore: r.temperamentScore,
          healthScore: r.healthScore,
          hatchDate: r.hatchDate
        })),
        meta: {
          totalHens: hens.length,
          totalRoosters: roosters.length
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/birds/:id/lineage-blacklist
 * Get all birds that should NOT be bred with this bird
 *
 * Blacklist includes:
 * 1. All birds from the same pairing (potential parents)
 * 2. All birds that share the same pairingId (siblings from same breeding group)
 * 3. All birds in the same brood group (siblings hatched together)
 *
 * Returns: { blacklistedBirdIds: string[], reasons: { [birdId]: string } }
 */
export const getLineageBlacklist = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const bird = await Bird.findOne({
      _id: id,
      ownerId,
      deletedAt: { $exists: false }
    });

    if (!bird) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Bird not found" }
      });
    }

    const blacklist = new Map(); // birdId -> reason

    // If this bird has no pairing, it's foundation stock - no lineage restrictions
    if (!bird.pairingId) {
      return res.json({
        data: {
          birdId: id,
          isFoundationStock: true,
          blacklistedBirdIds: [],
          reasons: {}
        }
      });
    }

    // 1. Get the pairing this bird came from
    const pairing = await Pairing.findById(bird.pairingId);
    if (pairing) {
      // All roosters in the pairing are potential sires
      for (const roosterId of pairing.roosterIds || []) {
        blacklist.set(roosterId.toString(), "potential_parent");
      }
      // All hens in the pairing are potential dams
      for (const henId of pairing.henIds || []) {
        blacklist.set(henId.toString(), "potential_parent");
      }
    }

    // 2. Find all other birds from the same pairing (siblings from same breeding program)
    const siblings = await Bird.find({
      ownerId,
      pairingId: bird.pairingId,
      _id: { $ne: bird._id },
      deletedAt: { $exists: false }
    });
    for (const sibling of siblings) {
      if (!blacklist.has(sibling._id.toString())) {
        blacklist.set(sibling._id.toString(), "sibling_same_pairing");
      }
    }

    // 3. Find brood groups this bird belongs to and blacklist brood-mates
    const memberships = await GroupMembership.find({
      ownerId,
      birdId: bird._id,
      deletedAt: { $exists: false }
    });

    for (const membership of memberships) {
      const group = await Group.findById(membership.groupId);
      // Only blacklist brood-mates if the group is linked to a pairing (it's a brood)
      if (group && group.pairingId) {
        const broodMates = await GroupMembership.find({
          ownerId,
          groupId: membership.groupId,
          birdId: { $ne: bird._id },
          deletedAt: { $exists: false }
        });
        for (const mate of broodMates) {
          if (!blacklist.has(mate.birdId.toString())) {
            blacklist.set(mate.birdId.toString(), "sibling_same_brood");
          }
        }
      }
    }

    // Convert Map to object for JSON response
    const reasons = {};
    for (const [birdId, reason] of blacklist) {
      reasons[birdId] = reason;
    }

    res.json({
      data: {
        birdId: id,
        isFoundationStock: false,
        pairingId: bird.pairingId,
        blacklistedBirdIds: Array.from(blacklist.keys()),
        reasons
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/birds/:id/can-breed-with/:targetId
 * Check if two birds can be bred together
 *
 * Returns: { canBreed: boolean, reason?: string }
 */
export const canBreedWith = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id, targetId } = req.params;

    // Get both birds
    const [bird1, bird2] = await Promise.all([
      Bird.findOne({ _id: id, ownerId, deletedAt: { $exists: false } }),
      Bird.findOne({ _id: targetId, ownerId, deletedAt: { $exists: false } })
    ]);

    if (!bird1) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "First bird not found" }
      });
    }
    if (!bird2) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Second bird not found" }
      });
    }

    // Same bird check
    if (id === targetId) {
      return res.json({
        data: { canBreed: false, reason: "same_bird" }
      });
    }

    // If either bird is foundation stock (no pairingId), they can breed
    if (!bird1.pairingId || !bird2.pairingId) {
      return res.json({
        data: { canBreed: true, reason: "foundation_stock" }
      });
    }

    // Same pairing check (siblings)
    if (bird1.pairingId.toString() === bird2.pairingId.toString()) {
      return res.json({
        data: { canBreed: false, reason: "siblings_same_pairing" }
      });
    }

    // Check if bird2 is a parent (in bird1's origin pairing)
    const pairing1 = await Pairing.findById(bird1.pairingId);
    if (pairing1) {
      const parentIds = [
        ...(pairing1.roosterIds || []).map(id => id.toString()),
        ...(pairing1.henIds || []).map(id => id.toString())
      ];
      if (parentIds.includes(targetId)) {
        return res.json({
          data: { canBreed: false, reason: "target_is_parent" }
        });
      }
    }

    // Check if bird1 is a parent (in bird2's origin pairing)
    const pairing2 = await Pairing.findById(bird2.pairingId);
    if (pairing2) {
      const parentIds = [
        ...(pairing2.roosterIds || []).map(id => id.toString()),
        ...(pairing2.henIds || []).map(id => id.toString())
      ];
      if (parentIds.includes(id)) {
        return res.json({
          data: { canBreed: false, reason: "self_is_parent" }
        });
      }
    }

    // All checks passed
    res.json({
      data: { canBreed: true }
    });
  } catch (err) {
    next(err);
  }
};
