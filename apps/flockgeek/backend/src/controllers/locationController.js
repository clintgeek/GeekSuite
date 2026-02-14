import Location from "../models/Location.js";

export const createLocation = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { name, type, capacity, cleaningIntervalDays, notes } = req.body;

    if (!name || !type) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "name and type required" }
      });
    }

    const location = await Location.create({
      ownerId,
      name,
      type,
      capacity,
      cleaningIntervalDays,
      notes
    });

    res.status(201).json({ data: { location } });
  } catch (err) {
    next(err);
  }
};

export const listLocations = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { type, isActive, page = 1, limit = 20, sortBy = "name", sortOrder = "asc" } = req.query;

    const filter = { ownerId, deletedAt: { $exists: false } };
    if (type) filter.type = type;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const items = await Location.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort(sortOptions);

    const total = await Location.countDocuments(filter);

    res.json({
      data: {
        locations: items,
        pagination: { total, page: parseInt(page), limit: parseInt(limit) }
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getLocation = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const location = await Location.findOne({
      _id: id,
      ownerId,
      deletedAt: { $exists: false }
    });

    if (!location) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Location not found" }
      });
    }

    res.json({ data: { location } });
  } catch (err) {
    next(err);
  }
};

export const updateLocation = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;
    const data = req.body;

    const location = await Location.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { ...data, updatedAt: new Date() },
      { new: true }
    );

    if (!location) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Location not found" }
      });
    }

    res.json({ data: { location } });
  } catch (err) {
    next(err);
  }
};

export const deleteLocation = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const location = await Location.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { deletedAt: new Date(), updatedAt: new Date() },
      { new: true }
    );

    if (!location) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Location not found" }
      });
    }

    res.json({ data: { location } });
  } catch (err) {
    next(err);
  }
};
