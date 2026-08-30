import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const bujoConn = getAppConnection('bujogeek');

/**
 * One document = "this browser, on this device, has agreed to be notified".
 *
 * A user holds as many of these as they have devices — a phone, a laptop, a
 * second browser — so `createdBy` is indexed but not unique. The endpoint URL
 * the push service hands out *is* the identity of a subscription, so it is the
 * unique key: re-subscribing the same browser must update the existing row
 * rather than accumulate duplicates (see reminderService.saveSubscription).
 *
 * Rows are disposable. A push service answering 404/410 means the endpoint is
 * dead for good — the scheduler deletes the row rather than retrying it, which
 * is the only garbage collection this collection gets.
 */
const pushSubscriptionSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
);

const PushSubscription =
  bujoConn.models.PushSubscription || bujoConn.model('PushSubscription', pushSubscriptionSchema);

export default PushSubscription;
