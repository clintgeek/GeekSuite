import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

// Shared definition (fields + indexes) in @geeksuite/schemas/newsgeek/source, the same one the
// newsgeek backend's ingest worker writes with — add fields there, never here.
import sourceModule from '@geeksuite/schemas/newsgeek/source';
import constantsModule from '@geeksuite/schemas/newsgeek/constants';

const { createSourceSchema } = sourceModule;
const conn = getAppConnection('newsgeek');

export const NewsSource = conn.models.NewsSource
  || conn.model('NewsSource', createSourceSchema(mongoose), constantsModule.COLLECTIONS.sources);
