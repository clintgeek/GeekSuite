import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const noteConn = getAppConnection('notegeek');

/**
 * NoteChunk — one embedded passage of a note (`noteChunks`, noteGeek DB).
 *
 * Kept OFF the Note document on purpose: 768 floats per passage, several
 * passages per note, would make every `notes` list read drag kilobytes of
 * vectors it never uses. The indexer (`indexer.js`) owns this collection —
 * it replaces a note's rows wholesale each time it re-embeds the note — and
 * `semantic.js` reads it. Deleting a note deletes its rows (resolvers.js) and
 * the indexer's sweep removes any it missed.
 *
 * `text` is the passage as embedded (without the nomic task prefix), kept so
 * a search hit can say WHY it matched ("…the Chamberlain unit needs a new
 * remote battery…") without re-reading and re-chunking the note.
 */
const NoteChunkSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    noteId: { type: mongoose.Schema.Types.ObjectId, required: true },
    chunk: { type: Number, required: true },
    text: { type: String, default: '' },
    /** sha256 of the passage text, for spotting an unchanged passage. */
    textHash: { type: String },
    vector: { type: [Number], required: true },
    model: { type: String, required: true },
  },
  { timestamps: { createdAt: false, updatedAt: true }, collection: 'noteChunks' }
);

NoteChunkSchema.index({ userId: 1, noteId: 1, chunk: 1 }, { unique: true });
NoteChunkSchema.index({ noteId: 1 });

const NoteChunk = noteConn.models.NoteChunk || noteConn.model('NoteChunk', NoteChunkSchema);

export default NoteChunk;
