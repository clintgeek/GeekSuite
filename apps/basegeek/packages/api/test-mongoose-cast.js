import mongoose from 'mongoose';
import { getAppConnection } from './src/graphql/shared/appConnections.js';

async function run() {
  process.env.MONGO_BASE_URI = 'mongodb://localhost:27017';
  await mongoose.connect('mongodb://localhost:27017/basegeek?authSource=admin');
  const noteConn = getAppConnection('notegeek');

  const NoteSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId },
    tags: [String],
    title: String,
  }, { collection: 'notes' }); // Ensure it uses 'notes' collection

  const Note = noteConn.models.Note || noteConn.model('Note', NoteSchema);

  // 1. Find a real user ID from a note
  const oneNote = await Note.findOne();
  if (!oneNote) {
    console.log("No notes in DB!");
    process.exit(0);
  }

  const realUserIdObj = oneNote.userId;
  const realUserIdStr = realUserIdObj.toString();
  console.log("Found note with userId:", realUserIdStr);

  // 2. Test distinct with ObjectId
  const objTags = await Note.distinct('tags', { userId: realUserIdObj });
  console.log("Distinct tags with ObjectId:", objTags);

  // 3. Test distinct with String
  const strTags = await Note.distinct('tags', { userId: realUserIdStr });
  console.log("Distinct tags with String:", strTags);

  // 4. Test findOneAndUpdate with String
  const updatedNote = await Note.findOneAndUpdate(
    { _id: oneNote._id.toString(), userId: realUserIdStr },
    { title: oneNote.title + " (tested)" },
    { new: true }
  );
  console.log("findOneAndUpdate with String:", updatedNote ? "SUCCESS" : "FAILED");

  process.exit(0);
}

run();
