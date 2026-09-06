import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import {
  validateInput,
  createBirdArgsSchema,
  updateBirdArgsSchema,
  createFlockGroupArgsSchema,
  updateFlockGroupArgsSchema,
  createFlockLocationArgsSchema,
  updateFlockLocationArgsSchema,
  recordEggProductionArgsSchema,
  updateEggProductionArgsSchema,
  createPairingArgsSchema,
  updatePairingArgsSchema,
  recordHatchEventArgsSchema,
  updateHatchEventArgsSchema,
  createMeatRunArgsSchema,
  updateMeatRunArgsSchema,
  addHealthRecordArgsSchema,
  deleteFlockEntityArgsSchema,
} from './validation.js';

// Input validation runs AFTER `requireUser` in every mutation below: an
// anonymous caller must still see `Unauthorized`, never a field-level
// complaint that tells them what a valid payload would have looked like.
const validateCreateBird = validateInput(createBirdArgsSchema);
const validateUpdateBird = validateInput(updateBirdArgsSchema);
const validateCreateFlockGroup = validateInput(createFlockGroupArgsSchema);
const validateUpdateFlockGroup = validateInput(updateFlockGroupArgsSchema);
const validateCreateFlockLocation = validateInput(createFlockLocationArgsSchema);
const validateUpdateFlockLocation = validateInput(updateFlockLocationArgsSchema);
const validateRecordEggProduction = validateInput(recordEggProductionArgsSchema);
const validateUpdateEggProduction = validateInput(updateEggProductionArgsSchema);
const validateCreatePairing = validateInput(createPairingArgsSchema);
const validateUpdatePairing = validateInput(updatePairingArgsSchema);
const validateRecordHatchEvent = validateInput(recordHatchEventArgsSchema);
const validateUpdateHatchEvent = validateInput(updateHatchEventArgsSchema);
const validateCreateMeatRun = validateInput(createMeatRunArgsSchema);
const validateUpdateMeatRun = validateInput(updateMeatRunArgsSchema);
const validateAddHealthRecord = validateInput(addHealthRecordArgsSchema);
const validateDeleteFlockEntity = validateInput(deleteFlockEntityArgsSchema);

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

// ── Ownership helpers ────────────────────────────────────────────────────────
// FlockGeek data is strictly per-owner: every document carries `ownerId` and
// nothing in the frontend expects cross-user visibility. GraphQL is mounted
// behind `optionalUser()`, so `context.user` may be null — and Mongoose strips
// `undefined` values out of a filter, which would turn `{ ownerId: undefined }`
// into an unscoped query over every tenant's data. Never build a filter from a
// possibly-undefined user id; go through these helpers instead.

/** Authenticated owner id, or throw. Use for every mutation. */
const requireUser = (context) => {
  const ownerId = context?.user?.id;
  if (!ownerId) {
    throw new GraphQLError('Unauthorized', { extensions: { code: 'UNAUTHENTICATED' } });
  }
  return String(ownerId);
};

/** Authenticated owner id, or null. Use for reads that degrade to empty. */
const currentUser = (context) => (context?.user?.id ? String(context.user.id) : null);

const notFound = (label) =>
  new GraphQLError(`${ label } not found`, { extensions: { code: 'NOT_FOUND' } });

/**
 * Reject references to documents owned by somebody else (and to ids that do
 * not exist at all). Soft-deleted rows still count as owned so that editing a
 * record that points at an archived location keeps working.
 */
const assertOwned = async (model, id, ownerId, label) => {
  if (id === undefined || id === null || id === '') return;
  validateId(id);
  const exists = await model.exists({ _id: id, ownerId });
  if (!exists) throw notFound(label);
};

const assertAllOwned = async (model, ids, ownerId, label) => {
  if (!Array.isArray(ids)) return;
  for (const id of ids) await assertOwned(model, id, ownerId, label);
};

/** Owner-scoped update; throws instead of returning null for a non-null field. */
const updateOwned = async (model, id, ownerId, patch, label) => {
  const doc = await model.findOneAndUpdate({ _id: id, ownerId }, patch, { new: true });
  if (!doc) throw notFound(label);
  return doc;
};

export const resolvers = {
  Query: {
    birds: async (_, { status }, context) => {
      const ownerId = currentUser(context);
      if (!ownerId) return [];
      const { Bird } = await getModels();
      const query = { ownerId, deletedAt: null };
      if (status) query.status = status;
      return Bird.find(query).sort({ name: 1, tagId: 1 });
    },
    bird: async (_, { id }, context) => {
      const ownerId = currentUser(context);
      if (!ownerId) return null;
      validateId(id);
      const { Bird } = await getModels();
      return Bird.findOne({ _id: id, ownerId, deletedAt: null });
    },
    birdTraits: async (_, { birdId }, context) => {
      const ownerId = currentUser(context);
      if (!ownerId) return [];
      validateId(birdId);
      const { BirdTrait } = await getModels();
      return BirdTrait.find({ birdId, ownerId, deletedAt: null }).sort({ loggedAt: -1 });
    },
    birdNotes: async (_, { birdId }, context) => {
      const ownerId = currentUser(context);
      if (!ownerId) return [];
      validateId(birdId);
      const { BirdNote } = await getModels();
      return BirdNote.find({ birdId, ownerId, deletedAt: null }).sort({ loggedAt: -1 });
    },
    healthRecords: async (_, { birdId }, context) => {
      const ownerId = currentUser(context);
      if (!ownerId) return [];
      validateId(birdId);
      const { HealthRecord } = await getModels();
      return HealthRecord.find({ birdId, ownerId, deletedAt: null }).sort({ eventDate: -1 });
    },
    eggProductions: async (_, { startDate, endDate, birdId, groupId }, context) => {
      const ownerId = currentUser(context);
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
      const ownerId = currentUser(context);
      if (!ownerId) return [];
      const { HatchEvent } = await getModels();
      return HatchEvent.find({ ownerId, deletedAt: null }).sort({ setDate: -1 });
    },
    hatchEvent: async (_, { id }, context) => {
      const ownerId = currentUser(context);
      if (!ownerId) return null;
      validateId(id);
      const { HatchEvent } = await getModels();
      return HatchEvent.findOne({ _id: id, ownerId, deletedAt: null });
    },
    pairings: async (_, { activeOnly }, context) => {
      const ownerId = currentUser(context);
      if (!ownerId) return [];
      const { Pairing } = await getModels();
      const query = { ownerId, deletedAt: null };
      if (activeOnly) query.active = true;
      return Pairing.find(query).sort({ startDate: -1 });
    },
    pairing: async (_, { id }, context) => {
      const ownerId = currentUser(context);
      if (!ownerId) return null;
      validateId(id);
      const { Pairing } = await getModels();
      return Pairing.findOne({ _id: id, ownerId, deletedAt: null });
    },
    flockGroups: async (_, __, context) => {
      const ownerId = currentUser(context);
      if (!ownerId) return [];
      const { Group } = await getModels();
      return Group.find({ ownerId, deletedAt: null }).sort({ startDate: -1 });
    },
    flockGroup: async (_, { id }, context) => {
      const ownerId = currentUser(context);
      if (!ownerId) return null;
      validateId(id);
      const { Group } = await getModels();
      return Group.findOne({ _id: id, ownerId, deletedAt: null });
    },
    groupMemberships: async (_, { groupId, activeOnly }, context) => {
      const ownerId = currentUser(context);
      if (!ownerId) return [];
      const { GroupMembership } = await getModels();
      const query = { ownerId, deletedAt: null };
      if (groupId) query.groupId = groupId;
      if (activeOnly) query.leftAt = null;
      return GroupMembership.find(query).populate('birdId').sort({ joinedAt: -1 });
    },
    flockLocations: async (_, { activeOnly }, context) => {
      const ownerId = currentUser(context);
      if (!ownerId) return [];
      const { Location } = await getModels();
      const query = { ownerId, deletedAt: null };
      if (activeOnly) query.isActive = true;
      return Location.find(query).sort({ name: 1 });
    },
    meatRuns: async (_, { status }, context) => {
      const ownerId = currentUser(context);
      if (!ownerId) return [];
      const { MeatRun } = await getModels();
      const query = { ownerId, deletedAt: null };
      if (status) query.status = status;
      return MeatRun.find(query).sort({ startDate: -1 });
    },
    meatRun: async (_, { id }, context) => {
      const ownerId = currentUser(context);
      if (!ownerId) return null;
      validateId(id);
      const { MeatRun } = await getModels();
      return MeatRun.findOne({ _id: id, ownerId, deletedAt: null });
    },
    flockEvents: async (_, { entityType, entityId }, context) => {
      const ownerId = currentUser(context);
      if (!ownerId) return [];
      const { Event } = await getModels();
      const query = { ownerId, deletedAt: null };
      if (entityType) query.entityType = entityType;
      if (entityId) query.entityId = entityId;
      return Event.find(query).sort({ occurredAt: -1 });
    },
  },

  Mutation: {
    createBird: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      // `ownerId` is not part of the GraphQL argument list, so no real client
      // can send one; a direct resolver call can, and it is dropped here —
      // before validation, so the strict schema never sees it — leaving the
      // session as the only source of ownership.
      const { ownerId: _payloadOwnerId, ...ownArgs } = rawArgs;
      const args = validateCreateBird(ownArgs);
      const { Bird } = await getModels();
      return new Bird({ ...args, ownerId }).save();
    },
    updateBird: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      const { id, ...args } = validateUpdateBird(rawArgs);
      validateId(id);
      const { Bird, Location } = await getModels();
      await assertOwned(Location, args.locationId, ownerId, 'Location');
      return updateOwned(Bird, id, ownerId, args, 'Bird');
    },
    recordEggProduction: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      const args = validateRecordEggProduction(rawArgs);
      const { EggProduction, Bird, Group, Location } = await getModels();
      await assertOwned(Bird, args.birdId, ownerId, 'Bird');
      await assertOwned(Group, args.groupId, ownerId, 'FlockGroup');
      await assertOwned(Location, args.locationId, ownerId, 'Location');
      // `date` is required by the schema and already a UTC-midnight calendar
      // day, so the old `? new Date(args.date) : new Date()` fallback is gone.
      return new EggProduction({ ...args, ownerId }).save();
    },
    updateEggProduction: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      const { id, ...args } = validateUpdateEggProduction(rawArgs);
      validateId(id);
      const { EggProduction, Location } = await getModels();
      await assertOwned(Location, args.locationId, ownerId, 'Location');
      return updateOwned(EggProduction, id, ownerId, args, 'EggProduction');
    },
    createPairing: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      const args = validateCreatePairing(rawArgs);
      const { Pairing, Bird } = await getModels();
      await assertAllOwned(Bird, args.roosterIds, ownerId, 'Bird');
      await assertAllOwned(Bird, args.henIds, ownerId, 'Bird');
      return new Pairing({ ...args, ownerId }).save();
    },
    updatePairing: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      const { id, ...args } = validateUpdatePairing(rawArgs);
      validateId(id);
      const { Pairing, Bird } = await getModels();
      await assertAllOwned(Bird, args.roosterIds, ownerId, 'Bird');
      await assertAllOwned(Bird, args.henIds, ownerId, 'Bird');
      return updateOwned(Pairing, id, ownerId, args, 'Pairing');
    },
    recordHatchEvent: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      const args = validateRecordHatchEvent(rawArgs);
      const { HatchEvent, Pairing } = await getModels();
      // Same shape as createMeatRun: a reference is checked against the
      // caller's own rows before it is written. `assertOwned` reads undefined
      // / null / '' as "no reference at all"; the same three must not reach
      // the ObjectId cast either, so an absent pairing is dropped rather than
      // written as an empty string.
      await assertOwned(Pairing, args.pairingId, ownerId, 'Pairing');
      const { pairingId, ...rest } = args;
      return new HatchEvent({
        ...rest,
        ...(pairingId ? { pairingId } : {}),
        ownerId
      }).save();
    },
    updateHatchEvent: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      const { id, ...args } = validateUpdateHatchEvent(rawArgs);
      validateId(id);
      const { HatchEvent } = await getModels();
      return updateOwned(HatchEvent, id, ownerId, args, 'HatchEvent');
    },
    createMeatRun: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      const args = validateCreateMeatRun(rawArgs);
      const { MeatRun, Pairing, HatchEvent } = await getModels();
      await assertOwned(Pairing, args.pairingId, ownerId, 'Pairing');
      await assertOwned(HatchEvent, args.hatchEventId, ownerId, 'HatchEvent');
      return new MeatRun({ ...args, ownerId }).save();
    },
    updateMeatRun: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      const { id, ...args } = validateUpdateMeatRun(rawArgs);
      validateId(id);
      const { MeatRun } = await getModels();
      return updateOwned(MeatRun, id, ownerId, args, 'MeatRun');
    },
    addHealthRecord: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      const args = validateAddHealthRecord(rawArgs);
      const { HealthRecord, Bird } = await getModels();
      await assertOwned(Bird, args.birdId, ownerId, 'Bird');
      return new HealthRecord({ ...args, ownerId }).save();
    },
    createFlockGroup: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      const args = validateCreateFlockGroup(rawArgs);
      const { Group } = await getModels();
      return new Group({ ...args, ownerId }).save();
    },
    updateFlockGroup: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      const { id, ...args } = validateUpdateFlockGroup(rawArgs);
      validateId(id);
      const { Group } = await getModels();
      return updateOwned(Group, id, ownerId, args, 'FlockGroup');
    },
    createFlockLocation: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      const args = validateCreateFlockLocation(rawArgs);
      const { Location } = await getModels();
      return new Location({ ...args, ownerId, isActive: true }).save();
    },
    updateFlockLocation: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      const { id, ...args } = validateUpdateFlockLocation(rawArgs);
      validateId(id);
      const { Location } = await getModels();
      return updateOwned(Location, id, ownerId, args, 'FlockLocation');
    },
    deleteFlockEntity: async (_, rawArgs, context) => {
      const ownerId = requireUser(context);
      const { type, id } = validateDeleteFlockEntity(rawArgs);
      validateId(id);
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
