import mongoose from 'mongoose';

// Lazy-load all FlockGeek models to avoid circular dependency issues at startup
const getModels = async () => ({
  Bird: (await import('./models/Bird.js')).default,
  BirdTrait: (await import('./models/BirdTrait.js')).default,
  BirdNote: (await import('./models/BirdNote.js')).default,
  HealthRecord: (await import('./models/HealthRecord.js')).default,
  EggProduction: (await import('./models/EggProduction.js')).default,
  HatchEvent: (await import('./models/HatchEvent.js')).default,
  Pairing: (await import('./models/Pairing.js')).default,
  Group: (await import('./models/Group.js')).default,
  GroupMembership: (await import('./models/GroupMembership.js')).default,
  Location: (await import('./models/Location.js')).default,
  Event: (await import('./models/Event.js')).default,
  MeatRun: (await import('./models/MeatRun.js')).default,
});

const validateId = (id) => {
  if (!id || id === 'undefined' || !mongoose.isValidObjectId(id)) {
    throw new Error(`Invalid ID format: ${ id }`);
  }
};

export const resolvers = {
  Query: {
    birds: async (_, { status }, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) return [];
      const { Bird } = await getModels();
      const query = { ownerId, deletedAt: null };
      if (status) query.status = status;
      return Bird.find(query).sort({ name: 1, tagId: 1 });
    },
    bird: async (_, { id }, context) => {
      validateId(id);
      const { Bird } = await getModels();
      return Bird.findOne({ _id: id, ownerId: context.user?.id, deletedAt: null });
    },
    birdTraits: async (_, { birdId }, context) => {
      validateId(birdId);
      const { BirdTrait } = await getModels();
      return BirdTrait.find({ birdId, ownerId: context.user?.id, deletedAt: null }).sort({ loggedAt: -1 });
    },
    birdNotes: async (_, { birdId }, context) => {
      validateId(birdId);
      const { BirdNote } = await getModels();
      return BirdNote.find({ birdId, ownerId: context.user?.id, deletedAt: null }).sort({ loggedAt: -1 });
    },
    healthRecords: async (_, { birdId }, context) => {
      validateId(birdId);
      const { HealthRecord } = await getModels();
      return HealthRecord.find({ birdId, ownerId: context.user?.id, deletedAt: null }).sort({ eventDate: -1 });
    },
    eggProductions: async (_, { startDate, endDate, birdId, groupId }, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) return [];
      const { EggProduction } = await getModels();
      const filter = { ownerId, deletedAt: null };
      if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = new Date(startDate);
        if (endDate) filter.date.$lte = new Date(endDate);
      }
      if (birdId) filter.birdId = birdId;
      if (groupId) filter.groupId = groupId;
      return EggProduction.find(filter).sort({ date: -1 });
    },
    hatchEvents: async (_, __, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) return [];
      const { HatchEvent } = await getModels();
      return HatchEvent.find({ ownerId, deletedAt: null }).sort({ setDate: -1 });
    },
    hatchEvent: async (_, { id }, context) => {
      validateId(id);
      const { HatchEvent } = await getModels();
      return HatchEvent.findOne({ _id: id, ownerId: context.user?.id, deletedAt: null });
    },
    pairings: async (_, { activeOnly }, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) return [];
      const { Pairing } = await getModels();
      const query = { ownerId, deletedAt: null };
      if (activeOnly) query.active = true;
      return Pairing.find(query).sort({ startDate: -1 });
    },
    pairing: async (_, { id }, context) => {
      validateId(id);
      const { Pairing } = await getModels();
      return Pairing.findOne({ _id: id, ownerId: context.user?.id, deletedAt: null });
    },
    flockGroups: async (_, __, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) return [];
      const { Group } = await getModels();
      return Group.find({ ownerId, deletedAt: null }).sort({ startDate: -1 });
    },
    flockGroup: async (_, { id }, context) => {
      validateId(id);
      const { Group } = await getModels();
      return Group.findOne({ _id: id, ownerId: context.user?.id, deletedAt: null });
    },
    groupMemberships: async (_, { groupId, activeOnly }, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) return [];
      const { GroupMembership } = await getModels();
      const query = { ownerId, deletedAt: null };
      if (groupId) query.groupId = groupId;
      if (activeOnly) query.leftAt = null;
      return GroupMembership.find(query).populate('birdId').sort({ joinedAt: -1 });
    },
    flockLocations: async (_, { activeOnly }, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) return [];
      const { Location } = await getModels();
      const query = { ownerId, deletedAt: null };
      if (activeOnly) query.isActive = true;
      return Location.find(query).sort({ name: 1 });
    },
    meatRuns: async (_, { status }, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) return [];
      const { MeatRun } = await getModels();
      const query = { ownerId, deletedAt: null };
      if (status) query.status = status;
      return MeatRun.find(query).sort({ startDate: -1 });
    },
    meatRun: async (_, { id }, context) => {
      validateId(id);
      const { MeatRun } = await getModels();
      return MeatRun.findOne({ _id: id, ownerId: context.user?.id, deletedAt: null });
    },
    flockEvents: async (_, { entityType, entityId }, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) return [];
      const { Event } = await getModels();
      const query = { ownerId, deletedAt: null };
      if (entityType) query.entityType = entityType;
      if (entityId) query.entityId = entityId;
      return Event.find(query).sort({ occurredAt: -1 });
    },
  },

  Mutation: {
    createBird: async (_, args, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) throw new Error('Unauthorized');
      const { Bird } = await getModels();
      return new Bird({ ...args, ownerId }).save();
    },
    updateBird: async (_, { id, ...args }, context) => {
      validateId(id);
      const { Bird } = await getModels();
      return Bird.findOneAndUpdate({ _id: id, ownerId: context.user?.id }, args, { new: true });
    },
    recordEggProduction: async (_, args, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) throw new Error('Unauthorized');
      const { EggProduction } = await getModels();
      return new EggProduction({ ...args, ownerId, date: args.date ? new Date(args.date) : new Date() }).save();
    },
    updateEggProduction: async (_, { id, ...args }, context) => {
      validateId(id);
      if (args.date) args.date = new Date(args.date);
      const { EggProduction } = await getModels();
      return EggProduction.findOneAndUpdate({ _id: id, ownerId: context.user?.id }, args, { new: true });
    },
    createPairing: async (_, args, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) throw new Error('Unauthorized');
      const { Pairing } = await getModels();
      return new Pairing({ ...args, ownerId }).save();
    },
    updatePairing: async (_, { id, ...args }, context) => {
      validateId(id);
      const { Pairing } = await getModels();
      return Pairing.findOneAndUpdate({ _id: id, ownerId: context.user?.id }, args, { new: true });
    },
    recordHatchEvent: async (_, args, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) throw new Error('Unauthorized');
      const { HatchEvent } = await getModels();
      return new HatchEvent({ ...args, ownerId }).save();
    },
    updateHatchEvent: async (_, { id, ...args }, context) => {
      validateId(id);
      const { HatchEvent } = await getModels();
      return HatchEvent.findOneAndUpdate({ _id: id, ownerId: context.user?.id }, args, { new: true });
    },
    createMeatRun: async (_, args, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) throw new Error('Unauthorized');
      const { MeatRun } = await getModels();
      return new MeatRun({ ...args, ownerId }).save();
    },
    updateMeatRun: async (_, { id, ...args }, context) => {
      validateId(id);
      const { MeatRun } = await getModels();
      return MeatRun.findOneAndUpdate({ _id: id, ownerId: context.user?.id }, args, { new: true });
    },
    addHealthRecord: async (_, args, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) throw new Error('Unauthorized');
      const { HealthRecord } = await getModels();
      return new HealthRecord({ ...args, ownerId }).save();
    },
    createFlockGroup: async (_, args, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) throw new Error('Unauthorized');
      const { Group } = await getModels();
      return new Group({ ...args, ownerId }).save();
    },
    updateFlockGroup: async (_, { id, ...args }, context) => {
      validateId(id);
      const { Group } = await getModels();
      return Group.findOneAndUpdate({ _id: id, ownerId: context.user?.id }, args, { new: true });
    },
    createFlockLocation: async (_, args, context) => {
      const ownerId = context.user?.id;
      if (!ownerId) throw new Error('Unauthorized');
      const { Location } = await getModels();
      return new Location({ ...args, ownerId, isActive: true }).save();
    },
    updateFlockLocation: async (_, { id, ...args }, context) => {
      validateId(id);
      const { Location } = await getModels();
      return Location.findOneAndUpdate({ _id: id, ownerId: context.user?.id }, args, { new: true });
    },
    deleteFlockEntity: async (_, { type, id }, context) => {
      validateId(id);
      const ownerId = context.user?.id;
      if (!ownerId) throw new Error('Unauthorized');
      const models = await getModels();
      const modelMap = {
        bird: models.Bird,
        eggproduction: models.EggProduction,
        meatrun: models.MeatRun,
        group: models.Group,
        pairing: models.Pairing,
        location: models.Location,
        hatch_event: models.HatchEvent,
      };
      const model = modelMap[type.toLowerCase()];
      if (!model) throw new Error(`Unsupported entity type for deletion: ${ type }`);
      const result = await model.findOneAndUpdate({ _id: id, ownerId }, { deletedAt: new Date() });
      return !!result;
    },
  },

  // Resolve id fields for all types (resolver key names must match the renamed schema types)
  Bird: { id: (b) => b._id.toString() },
  BirdTrait: { id: (t) => t._id.toString() },
  BirdNote: { id: (n) => n._id.toString() },
  HealthRecord: { id: (h) => h._id.toString() },
  EggProduction: { id: (e) => e._id.toString() },
  HatchEvent: { id: (h) => h._id.toString() },
  Pairing: { id: (p) => p._id.toString() },
  FlockGroup: { id: (g) => g._id.toString() },
  GroupMembership: {
    id: (m) => m._id.toString(),
    bird: (m) => m.birdId && typeof m.birdId === 'object' ? m.birdId : null,
  },
  FlockLocation: { id: (l) => l._id.toString() },
  FlockEvent: { id: (e) => e._id.toString() },
  MeatRun: { id: (m) => m._id.toString() },
};
