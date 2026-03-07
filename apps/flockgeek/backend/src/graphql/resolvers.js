import Bird from '../models/Bird.js';
import BirdTrait from '../models/BirdTrait.js';
import BirdNote from '../models/BirdNote.js';
import HealthRecord from '../models/HealthRecord.js';
import EggProduction from '../models/EggProduction.js';
import HatchEvent from '../models/HatchEvent.js';
import Pairing from '../models/Pairing.js';
import Group from '../models/Group.js';
import GroupMembership from '../models/GroupMembership.js';
import Location from '../models/Location.js';
import Event from '../models/Event.js';
import LineageCache from '../models/LineageCache.js';
import MeatRun from '../models/MeatRun.js';
import mongoose from 'mongoose';

const getOwnerId = (context) => context.user?.id || '000000000000000000000000';

const validateId = (id) => {
    if (!id || id === 'undefined' || !mongoose.isValidObjectId(id)) {
        throw new Error(`Invalid ID format: ${ id }`);
    }
};

export const resolvers = {
    Query: {
        birds: async (_, { status }, context) => {
            const ownerId = getOwnerId(context);
            const query = { ownerId, deletedAt: null };
            if (status) query.status = status;
            return await Bird.find(query).sort({ name: 1, tagId: 1 });
        },
        bird: async (_, { id }, context) => {
            validateId(id);
            return await Bird.findOne({ _id: id, ownerId: getOwnerId(context), deletedAt: null });
        },
        birdTraits: async (_, { birdId }, context) => {
            validateId(birdId);
            return await BirdTrait.find({ birdId, ownerId: getOwnerId(context), deletedAt: null }).sort({ loggedAt: -1 });
        },
        birdNotes: async (_, { birdId }, context) => {
            validateId(birdId);
            return await BirdNote.find({ birdId, ownerId: getOwnerId(context), deletedAt: null }).sort({ loggedAt: -1 });
        },
        healthRecords: async (_, { birdId }, context) => {
            validateId(birdId);
            return await HealthRecord.find({ birdId, ownerId: getOwnerId(context), deletedAt: null }).sort({ eventDate: -1 });
        },
        eggProductions: async (_, { startDate, endDate, birdId, groupId }, context) => {
            const ownerId = getOwnerId(context);
            const filter = { ownerId, deletedAt: null };
            if (startDate || endDate) {
                filter.date = {};
                if (startDate) filter.date.$gte = new Date(startDate);
                if (endDate) filter.date.$lte = new Date(endDate);
            }
            if (birdId) filter.birdId = birdId;
            if (groupId) filter.groupId = groupId;
            return await EggProduction.find(filter).sort({ date: -1 });
        },
        hatchEvents: async (_, { activeOnly }, context) => {
            const ownerId = getOwnerId(context);
            const query = { ownerId, deletedAt: null };
            // activeOnly logic could be based on hatchDate being in the future or null
            return await HatchEvent.find(query).sort({ setDate: -1 });
        },
        hatchEvent: async (_, { id }, context) => {
            validateId(id);
            return await HatchEvent.findOne({ _id: id, ownerId: getOwnerId(context), deletedAt: null });
        },
        pairings: async (_, { activeOnly }, context) => {
            const query = { ownerId: getOwnerId(context), deletedAt: null };
            if (activeOnly) query.active = true;
            return await Pairing.find(query).sort({ startDate: -1 });
        },
        pairing: async (_, { id }, context) => {
            validateId(id);
            return await Pairing.findOne({ _id: id, ownerId: getOwnerId(context), deletedAt: null });
        },
        groups: async (_, { activeOnly }, context) => {
            const query = { ownerId: getOwnerId(context), deletedAt: null };
            // activeOnly could be based on endDate
            return await Group.find(query).sort({ startDate: -1 });
        },
        group: async (_, { id }, context) => {
            validateId(id);
            return await Group.findOne({ _id: id, ownerId: getOwnerId(context), deletedAt: null });
        },
        locations: async (_, { activeOnly }, context) => {
            const query = { ownerId: getOwnerId(context), deletedAt: null };
            if (activeOnly) query.isActive = true;
            return await Location.find(query).sort({ name: 1 });
        },
        meatRuns: async (_, { status }, context) => {
            const query = { ownerId: getOwnerId(context), deletedAt: null };
            if (status) query.status = status;
            return await MeatRun.find(query).sort({ startDate: -1 });
        },
        meatRun: async (_, { id }, context) => {
            validateId(id);
            return await MeatRun.findOne({ _id: id, ownerId: getOwnerId(context), deletedAt: null });
        },
        events: async (_, { entityType, entityId }, context) => {
            const query = { ownerId: getOwnerId(context), deletedAt: null };
            if (entityType) query.entityType = entityType;
            if (entityId) query.entityId = entityId;
            return await Event.find(query).sort({ occurredAt: -1 });
        },
    },
    Mutation: {
        createBird: async (_, args, context) => {
            const bird = new Bird({ ...args, ownerId: getOwnerId(context) });
            return await bird.save();
        },
        updateBird: async (_, { id, ...args }, context) => {
            validateId(id);
            return await Bird.findOneAndUpdate(
                { _id: id, ownerId: getOwnerId(context) },
                args,
                { new: true }
            );
        },
        recordEggProduction: async (_, args, context) => {
            const dateToUse = args.date ? new Date(args.date) : new Date();
            const record = new EggProduction({
                ...args,
                ownerId: getOwnerId(context),
                date: dateToUse
            });
            return await record.save();
        },
        updateEggProduction: async (_, { id, ...args }, context) => {
            validateId(id);
            if (args.date) args.date = new Date(args.date);
            return await EggProduction.findOneAndUpdate(
                { _id: id, ownerId: getOwnerId(context) },
                args,
                { new: true }
            );
        },
        createPairing: async (_, args, context) => {
            const pairing = new Pairing({ ...args, ownerId: getOwnerId(context) });
            return await pairing.save();
        },
        updatePairing: async (_, { id, ...args }, context) => {
            validateId(id);
            if (args.pairingDate) args.pairingDate = new Date(args.pairingDate);
            return await Pairing.findOneAndUpdate(
                { _id: id, ownerId: getOwnerId(context) },
                args,
                { new: true }
            );
        },
        recordHatchEvent: async (_, args, context) => {
            const event = new HatchEvent({ ...args, ownerId: getOwnerId(context) });
            return await event.save();
        },
        updateHatchEvent: async (_, { id, ...args }, context) => {
            validateId(id);
            if (args.setDate) args.setDate = new Date(args.setDate);
            if (args.hatchDate) args.hatchDate = new Date(args.hatchDate);
            return await HatchEvent.findOneAndUpdate(
                { _id: id, ownerId: getOwnerId(context) },
                args,
                { new: true }
            );
        },
        createMeatRun: async (_, args, context) => {
            const run = new MeatRun({ ...args, ownerId: getOwnerId(context) });
            return await run.save();
        },
        updateMeatRun: async (_, { id, ...args }, context) => {
            validateId(id);
            return await MeatRun.findOneAndUpdate(
                { _id: id, ownerId: getOwnerId(context) },
                args,
                { new: true }
            );
        },
        addHealthRecord: async (_, args, context) => {
            const record = new HealthRecord({ ...args, ownerId: getOwnerId(context) });
            return await record.save();
        },
        deleteEntity: async (_, { type, id }, context) => {
            validateId(id);
            const ownerId = getOwnerId(context);
            let model;
            switch (type.toLowerCase()) {
                case 'bird': model = Bird; break;
                case 'eggproduction': model = EggProduction; break;
                case 'meatrun': model = MeatRun; break;
                case 'group': model = Group; break;
                case 'pairing': model = Pairing; break;
                case 'location': model = Location; break;
                default: throw new Error(`Unsupported entity type for deletion: ${ type }`);
            }
            const result = await model.findOneAndUpdate(
                { _id: id, ownerId },
                { deletedAt: new Date() }
            );
            return !!result;
        }
    },
    Bird: { id: (b) => b._id.toString() },
    BirdTrait: { id: (t) => t._id.toString() },
    BirdNote: { id: (n) => n._id.toString() },
    HealthRecord: { id: (h) => h._id.toString() },
    EggProduction: { id: (e) => e._id.toString() },
    HatchEvent: { id: (h) => h._id.toString() },
    Pairing: { id: (p) => p._id.toString() },
    Group: { id: (g) => g._id.toString() },
    GroupMembership: { id: (m) => m._id.toString() },
    Location: { id: (l) => l._id.toString() },
    Event: { id: (e) => e._id.toString() },
    MeatRun: { id: (m) => m._id.toString() },
};
