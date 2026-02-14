import HealthRecord from "../models/HealthRecord.js";

/**
 * POST /api/health-records
 * Create a new health record
 */
export const createHealthRecord = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { birdId, eventDate, type, diagnosis, treatment, outcome, cullReason, vet, costCents, notes } = req.body;

    if (!birdId || !eventDate || !type) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "birdId, eventDate, and type required" }
      });
    }

    const record = await HealthRecord.create({
      ownerId,
      birdId,
      eventDate,
      type,
      diagnosis,
      treatment,
      outcome,
      cullReason,
      vet,
      costCents,
      notes
    });

    res.status(201).json({ data: { healthRecord: record } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/health-records
 * List health records with filtering
 */
export const listHealthRecords = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { birdId, type, page = 1, limit = 20 } = req.query;

    const filter = { ownerId, deletedAt: { $exists: false } };
    if (birdId) filter.birdId = birdId;
    if (type) filter.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const items = await HealthRecord.find(filter)
      .populate("birdId", "name tagId")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ eventDate: -1 });

    const total = await HealthRecord.countDocuments(filter);

    res.json({
      data: {
        healthRecords: items,
        pagination: { total, page: parseInt(page), limit: parseInt(limit) }
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/health-records/:id
 * Get a single health record
 */
export const getHealthRecord = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const record = await HealthRecord.findOne({
      _id: id,
      ownerId,
      deletedAt: { $exists: false }
    }).populate("birdId", "name tagId");

    if (!record) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Health record not found" }
      });
    }

    res.json({ data: { healthRecord: record } });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/health-records/:id
 * Update a health record
 */
export const updateHealthRecord = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;
    const data = req.body;

    const record = await HealthRecord.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { ...data, updatedAt: new Date() },
      { new: true }
    );

    if (!record) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Health record not found" }
      });
    }

    res.json({ data: { healthRecord: record } });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/health-records/:id
 * Soft delete a health record
 */
export const deleteHealthRecord = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const record = await HealthRecord.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { deletedAt: new Date(), updatedAt: new Date() },
      { new: true }
    );

    if (!record) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Health record not found" }
      });
    }

    res.json({ data: { healthRecord: record } });
  } catch (err) {
    next(err);
  }
};
