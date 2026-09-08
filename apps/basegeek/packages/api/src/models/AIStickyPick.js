import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';
import { PROVIDER_IDS } from '../config/aiProviders.js';

/**
 * AIStickyPick — which model answered *this* conversation, so the next turn
 * gets the same one.
 *
 * D4/D5 in DOCS/AIGEEK_ELEVATION_PLAN.md: "Pins are roles, not ids." StoryGeek's
 * GM needs a model that does not change voice mid-story, and until now it got
 * that by hard-coding `STORYGEEK_GM_PROVIDER` / `STORYGEEK_GM_MODEL` in
 * `.env.production` — a human-typed model id, which is exactly the thing the
 * catalog job exists to stop us maintaining. When that id was retired by the
 * vendor, every turn errored to the player, forever, because nothing noticed.
 *
 * A sticky pick is the replacement: the model is chosen *once* per
 * conversation by the ordinary `auto` walk, remembered here, and reused until
 * it stops working. When it stops working the walk picks again and the old one
 * is appended to `previous` — which is what Phase 3's "needs attention" panel
 * reads (`previous.length > 0` in the last 7 days) to say "your GM changed
 * model on Tuesday" instead of leaving you to notice the prose got worse.
 *
 * Stickiness is opt-in per routing row (`AIAppConfig.sticky:
 * 'per-conversation'`), because it is a trade: a sticky call skips the
 * fitness ranking that Phase 1 built, and that is only worth it where
 * consistency of voice beats freshness of pick. StoryGeek's row gets it;
 * nothing else needs it yet.
 *
 * Rows expire 30 days after they were picked. A conversation nobody has
 * touched in a month has no voice left to keep consistent, and a TTL is
 * cheaper than a sweep job that has to know what a dead story looks like.
 */
const aiStickyPickSchema = new mongoose.Schema({
  /**
   * `${appId}:${conversationId}`. Both halves are needed: two apps may share
   * an id space (a story id and a note id are both Mongo ids) and a pick
   * belongs to one app's routing row.
   */
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  /** Resolved app id (from the credential, never a request body). */
  app: {
    type: String,
    required: true
  },
  /** The conversation this pick is for, as the caller spells it. */
  conversationId: {
    type: String,
    default: null
  },
  provider: {
    type: String,
    required: true,
    enum: PROVIDER_IDS
  },
  modelId: {
    type: String,
    required: true
  },
  /**
   * Whether the stored pick is a `paid-fallback` row. A paid pick is only
   * reused while the routing row still carries `allowPaid` — flipping that
   * switch off must not leave a conversation quietly buying tokens because
   * of a decision made last week.
   */
  paid: {
    type: Boolean,
    default: false
  },
  /** When this pick was made. The TTL below counts from here. */
  pickedAt: {
    type: Date,
    default: Date.now
  },
  /**
   * Every model this conversation used to be on, newest last. `reason` is the
   * free-tier failure code that retired it (`http_404`, `empty_content`, …)
   * or `repin` when the walk simply landed somewhere else.
   */
  previous: {
    type: [{
      provider: { type: String, default: null },
      modelId: { type: String, default: null },
      retiredAt: { type: Date, default: null },
      reason: { type: String, default: null }
    }],
    default: []
  }
}, {
  timestamps: true
});

/** 30 days from the last pick. See the note on staleness above. */
export const STICKY_PICK_TTL_SECONDS = 30 * 24 * 60 * 60;
aiStickyPickSchema.index({ pickedAt: 1 }, { expireAfterSeconds: STICKY_PICK_TTL_SECONDS });

/** The one spelling of a sticky key. Mirrors `aiRoute`'s pure version. */
export function stickyKey(appId, conversationId) {
  if (!conversationId) return null;
  return `${appId || 'unknown'}:${conversationId}`;
}

const aiGeekConnection = getAIGeekConnection();
const AIStickyPick = aiGeekConnection.model('AIStickyPick', aiStickyPickSchema);

export default AIStickyPick;
