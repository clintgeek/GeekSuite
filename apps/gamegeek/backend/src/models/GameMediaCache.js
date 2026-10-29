/**
 * GameMediaCache — provider media (screenshots, trailers, page links) for the
 * detail page, keyed by the game's provider ids, not by game: two households
 * with the same Steam app share one entry, and a game whose ids change
 * (Find metadata, unlink) simply misses and fetches fresh.
 * apps/gamegeek/DOCS/METADATA_ENRICHMENT.md §Media and links.
 *
 * Local to this backend on purpose: nothing else (the gateway included)
 * reads it, and it holds nothing personal — only public provider URLs.
 * Mongo's TTL monitor deletes an entry once `expiresAt` passes; the service
 * also checks `expiresAt` itself, since the monitor only runs once a minute.
 */
import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // e.g. "steam:367520|igdb:14593|rawg:"
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    fetchedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false, collection: 'gamemediacache' },
);

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.GameMediaCache || mongoose.model('GameMediaCache', schema);
