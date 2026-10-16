/**
 * householdAccess — who else's food this person may READ (contract C4).
 *
 * A household shares one `usersettings.household.household_id`. Any member may
 * read (never edit or delete) a food item owned by any other member, so a meal
 * Heather logs from food Chef saved resolves for her instead of failing the
 * ownership check. This mirrors the gateway's rule; the two must agree, or the
 * same meal logs on one path and not the other.
 *
 * Access only. Search and suggest ranking are NOT widened by this: they still
 * see global rows plus the person's own (`foodCatalogVisibilityFilter`).
 */

import UserSettings from '../models/UserSettings.js';
import logger from '../config/logger.js';

/**
 * The OTHER members of this person's household, as user id strings. Empty when
 * they have no household, or when the lookup fails — a failed lookup narrows
 * access to their own and global foods, it never widens it.
 *
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export async function householdMemberIds(userId) {
  if (!userId) return [];
  try {
    const mine = await UserSettings.findOne({ user_id: userId }).select('household').lean();
    const householdId = mine?.household?.household_id;
    if (!householdId) return [];

    const members = await UserSettings.find({
      'household.household_id': householdId,
      user_id: { $ne: userId }
    }).select('user_id').lean();
    return (members || []).map((m) => String(m.user_id)).filter(Boolean);
  } catch (error) {
    logger.warn({ err: error, userId }, 'Household lookup failed — own and global foods only');
    return [];
  }
}

/**
 * A Mongo filter for the food items this person may read: global rows (both
 * "no owner" shapes), their own, and their household's.
 *
 * @param {string} userId
 * @param {string[]} [memberIds] from `householdMemberIds`
 * @returns {Object}
 */
export function foodReadableFilter(userId, memberIds = []) {
  const owners = [userId, ...memberIds].filter(Boolean).map(String);
  const clauses = [{ user_id: null }, { user_id: { $exists: false } }];
  if (owners.length) clauses.unshift({ user_id: { $in: owners } });
  return { $or: clauses };
}

export default { householdMemberIds, foodReadableFilter };
