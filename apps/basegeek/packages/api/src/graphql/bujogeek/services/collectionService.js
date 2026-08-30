import mongoose from 'mongoose';
import Collection from '../models/Collection.js';
import Task from '../models/Task.js';
import taskService from './taskService.js';

/**
 * CollectionService — CRUD for BuJo collections plus the collection-scoped task
 * read. Mirrors taskService's ownership discipline: every method funnels
 * through `requireUser`, and every query carries `createdBy` so a resolver can
 * never issue an unscoped read or write.
 */
class CollectionService {
  requireUser(userId) {
    if (!userId) {
      const err = new Error('Unauthorized');
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    return userId;
  }

  /** The user's collections — unarchived first, then alphabetical. */
  async listCollections(userId) {
    this.requireUser(userId);
    return Collection.find({ createdBy: userId }).sort({ archived: 1, name: 1 });
  }

  /**
   * Load a collection by id, scoped to its owner. Returns null when the id is
   * malformed, does not exist, or belongs to somebody else — callers must not
   * be able to tell these apart.
   */
  async findOwnedCollection(collectionId, userId) {
    this.requireUser(userId);
    if (!mongoose.Types.ObjectId.isValid(collectionId)) return null;
    return Collection.findOne({ _id: collectionId, createdBy: userId });
  }

  async createCollection({ name, description, createdBy }) {
    this.requireUser(createdBy);
    return new Collection({
      name,
      description: description ?? null,
      createdBy,
    }).save();
  }

  async updateCollection(collectionId, updates, userId) {
    this.requireUser(userId);
    if (!mongoose.Types.ObjectId.isValid(collectionId)) return null;
    const safe = {};
    for (const key of ['name', 'description', 'archived']) {
      if (updates && updates[key] !== undefined) safe[key] = updates[key];
    }
    return Collection.findOneAndUpdate(
      { _id: collectionId, createdBy: userId },
      safe,
      { new: true, runValidators: true }
    );
  }

  /**
   * Deleting a collection does NOT delete its entries by default — they are
   * detached (collectionId unset) and become ordinary undated/dated tasks.
   * `deleteTasks: true` cascades instead.
   */
  async deleteCollection(collectionId, deleteTasks, userId) {
    this.requireUser(userId);
    const collection = await this.findOwnedCollection(collectionId, userId);
    if (!collection) return null;

    if (deleteTasks) {
      await Task.deleteMany({ createdBy: userId, collectionId: collection._id });
    } else {
      await Task.updateMany(
        { createdBy: userId, collectionId: collection._id },
        { $set: { collectionId: null } }
      );
    }

    await Collection.deleteOne({ _id: collection._id, createdBy: userId });
    return collection;
  }

  /** A collection's entries, owner-scoped, in taskService's canonical order. */
  async getTasksForCollection(collectionId, userId) {
    this.requireUser(userId);
    const collection = await this.findOwnedCollection(collectionId, userId);
    if (!collection) return [];
    const tasks = await Task.find({
      createdBy: userId,
      collectionId: collection._id,
      isSeriesMaster: { $ne: true },
    }).populate('parentTask', 'content status');
    return taskService.sortTasks(tasks.map((t) => t.toObject()));
  }

  /** { total, completed } entry counts for one owned collection. */
  async getCounts(collectionId, userId) {
    this.requireUser(userId);
    if (!mongoose.Types.ObjectId.isValid(collectionId)) return { total: 0, completed: 0 };
    const [total, completed] = await Promise.all([
      Task.countDocuments({ createdBy: userId, collectionId }),
      Task.countDocuments({ createdBy: userId, collectionId, status: 'completed' }),
    ]);
    return { total, completed };
  }
}

export default new CollectionService();
