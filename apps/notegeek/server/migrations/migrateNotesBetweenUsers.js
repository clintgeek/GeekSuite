import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Note from '../models/Note.js';
import User from '../models/User.js';

mongoose.set('strictQuery', true);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });
dotenv.config();

function getArgValue(prefix) {
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (!match) return null;
  const idx = match.indexOf('=');
  if (idx === -1) return null;
  return match.slice(idx + 1);
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function connect() {
  if (!process.env.DB_URI) {
    throw new Error('DB_URI is not set');
  }

  await mongoose.connect(process.env.DB_URI, { authSource: 'admin' });
}

async function listUsersWithNoteCounts() {
  const dbName = mongoose.connection?.db?.databaseName;
  const dbHost = mongoose.connection?.host;
  const dbPort = mongoose.connection?.port;

  const users = await User.find({}).sort({ createdAt: 1 });

  const usersWithCounts = [];
  for (const user of users) {
    const count = await Note.countDocuments({ userId: user._id });
    usersWithCounts.push({
      _id: user._id.toString(),
      email: user.email,
      userId: user.userId || null,
      noteCount: count,
      createdAt: user.createdAt,
    });
  }

  const totalNotes = await Note.countDocuments({});

  const ownerCounts = await Note.aggregate([
    { $group: { _id: '$userId', noteCount: { $sum: 1 } } },
    { $sort: { noteCount: -1 } },
  ]);

  const owners = [];
  for (const row of ownerCounts) {
    const ownerId = row?._id;
    const ownerIdStr = ownerId ? ownerId.toString() : null;
    const ownerUser = ownerIdStr ? await User.findById(ownerIdStr) : null;
    owners.push({
      userObjectId: ownerIdStr,
      noteCount: row.noteCount,
      userFound: Boolean(ownerUser),
      email: ownerUser?.email || null,
      baseGeekUserId: ownerUser?.userId || null,
    });
  }

  console.log(
    JSON.stringify(
      {
        connection: {
          databaseName: dbName,
          host: dbHost,
          port: dbPort,
        },
        totals: {
          users: usersWithCounts.length,
          notes: totalNotes,
        },
        users: usersWithCounts,
        noteOwners: owners,
      },
      null,
      2
    )
  );
}

async function migrateNotes({ fromUserObjectId, toUserObjectId, dryRun }) {
  if (!mongoose.Types.ObjectId.isValid(fromUserObjectId)) {
    throw new Error(`Invalid --from ObjectId: ${fromUserObjectId}`);
  }

  if (!mongoose.Types.ObjectId.isValid(toUserObjectId)) {
    throw new Error(`Invalid --to ObjectId: ${toUserObjectId}`);
  }

  const allowOrphanFrom = hasFlag('--allow-orphan-from');

  const toUser = await User.findById(toUserObjectId);

  if (!toUser) throw new Error(`Target user not found: ${toUserObjectId}`);

  const fromUser = await User.findById(fromUserObjectId);
  if (!fromUser && !allowOrphanFrom) {
    throw new Error(`Source user not found: ${fromUserObjectId}. If this is an orphaned owner id, re-run with --allow-orphan-from`);
  }

  if (!fromUser && allowOrphanFrom) {
    if (!toUser.userId) {
      throw new Error('Target user has no BaseGeek userId set; refusing orphan migration');
    }

    if (toUser.userId !== fromUserObjectId) {
      throw new Error(
        `Refusing orphan migration: target user's userId (${toUser.userId}) does not match --from (${fromUserObjectId})`
      );
    }
  }

  const existingCount = await Note.countDocuments({ userId: new mongoose.Types.ObjectId(fromUserObjectId) });
  const alreadyOnTargetCount = await Note.countDocuments({ userId: toUser._id });

  const summary = {
    from: {
      _id: fromUser ? fromUser._id.toString() : fromUserObjectId,
      email: fromUser?.email || null,
      userId: fromUser?.userId || null,
      noteCount: existingCount,
    },
    to: {
      _id: toUser._id.toString(),
      email: toUser.email,
      userId: toUser.userId || null,
      noteCount: alreadyOnTargetCount,
    },
    dryRun,
    allowOrphanFrom,
  };

  if (dryRun) {
    console.log(JSON.stringify({ ...summary, updated: 0 }, null, 2));
    return;
  }

  const result = await Note.updateMany(
    { userId: new mongoose.Types.ObjectId(fromUserObjectId) },
    { $set: { userId: toUser._id } }
  );

  console.log(
    JSON.stringify(
      {
        ...summary,
        matched: result.matchedCount ?? result.n,
        modified: result.modifiedCount ?? result.nModified,
      },
      null,
      2
    )
  );
}

async function main() {
  const list = hasFlag('--list');
  const dryRun = hasFlag('--dry-run');
  const from = getArgValue('--from');
  const to = getArgValue('--to');

  await connect();

  if (list) {
    await listUsersWithNoteCounts();
    return;
  }

  if (!from || !to) {
    throw new Error(
      'Usage: node migrations/migrateNotesBetweenUsers.js --list | --from=<oldUserObjectId> --to=<newUserObjectId> [--dry-run] [--allow-orphan-from]'
    );
  }

  await migrateNotes({ fromUserObjectId: from, toUserObjectId: to, dryRun });
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error(err?.message || err);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
