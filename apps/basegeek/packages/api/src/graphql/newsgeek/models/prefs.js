import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

// Per-reader prefs. Shared definition in @geeksuite/schemas/newsgeek/prefs; add fields there.
import prefsModule from '@geeksuite/schemas/newsgeek/prefs';
import constantsModule from '@geeksuite/schemas/newsgeek/constants';

const { createPrefsSchema } = prefsModule;
const conn = getAppConnection('newsgeek');

export const NewsPrefs = conn.models.NewsPrefs
  || conn.model('NewsPrefs', createPrefsSchema(mongoose), constantsModule.COLLECTIONS.prefs);
