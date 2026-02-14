import mongoose from 'mongoose';

const EventSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    entityType: { type: String, enum: ['bird','group','space','pairing'], required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    eventType: { type: String, enum: ['hatched','assigned','moved','treatment','culled','died','paired','unpaired','weighed','vaccination','inspection','eggs_set','eggs_hatched','cleaned','feed_added','note'], required: true },
    eventDate: { type: Date, required: true },
    payload: { type: Object },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

EventSchema.index({ ownerId: 1, entityType: 1, entityId: 1, eventDate: -1 });

export default mongoose.model('Event', EventSchema);
