import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const bujoConn = getAppConnection('bujogeek');

const journalEntrySchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  type: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'meeting', 'custom'],
    default: 'daily',
  },
  date: { type: Date, required: true, default: Date.now },
  tags: [{ type: String, trim: true }],
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  metadata: {
    mood: String,
    energy: String,
    location: String,
    weather: String,
    customFields: Map,
  },
  status: { type: String, enum: ['draft', 'published'], default: 'published' },
  // Provenance, not behaviour: true when the writer accepted an AI-drafted
  // weekly review (`reviewDraft`) as the starting point for this entry. It is
  // written only by the client, only on an explicit "Use as review", and
  // nothing branches on it — it exists so a drafted entry stays labelled
  // after it is saved (DOCS/AI_IDEAS.md, rule 2).
  //
  // Parity note: unlike fitnessgeek's UserSettings there is no second copy of
  // this schema anywhere in the suite — bujogeek's REST layer was deleted in
  // 3af40cc and this model has exactly one declaration, here. Adding a field
  // is this file plus `typeDefs.js`; there is no allow-list to keep in step.
  aiDrafted: { type: Boolean, default: false },
}, { timestamps: true });

journalEntrySchema.index({ title: 'text', content: 'text', tags: 'text' });

journalEntrySchema.virtual('preview').get(function () {
  return this.content.substring(0, 200) + (this.content.length > 200 ? '...' : '');
});

const JournalEntry = bujoConn.models.JournalEntry || bujoConn.model('JournalEntry', journalEntrySchema);
export default JournalEntry;
